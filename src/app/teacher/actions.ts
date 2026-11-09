"use server";

import { refresh } from "next/cache";
import { randomInt } from "node:crypto";
import { getSession } from "@/lib/session";
import type { StatRow } from "@/lib/classStats";
import { loadStatRows, yearsWithSubmissions } from "@/lib/classStatsStore";
import { AiNotConfiguredError, AiRefusedError, draftGrade } from "@/lib/ai";
import { problemForAi } from "@/lib/aiChat";
import { draftMatches, toDraft, type GradingDraft } from "@/lib/gradingDraft";
import { DraftsNotReadyError, insertDraft, latestDraft, submissionForDraft } from "@/lib/gradingDraftStore";
import { processSummaryText, summarizeProcess } from "@/lib/process-summary";
import { validEntries } from "@/lib/replay";
import { withDescs, canMarkWrong, GRADING_PAGE_SIZE, MAX_FEEDBACK, MAX_WRONG_REASON, validateRubric, validateScores, type GradingRow, type RubricPart } from "@/lib/grading";
import {
  classesWithSubmissions,
  deleteSubmission,
  getRubric,
  getScoreTotal,
  listForGrading,
  pendingBySubject,
  RubricsNotReadyError,
  saveRubric,
  saveScores,
  setWrongReason,
  type GradingFilter,
} from "@/lib/gradingStore";
import type { AiChat } from "@/lib/aiChat";
import { chatsForReplay, listChatsSince, setChatFlag } from "@/lib/aiChatStore";
import type { AiReview } from "@/lib/aiReview";
import { getReview, listReviewsSince, setReviewFlag } from "@/lib/aiReviewStore";
import { normalizeSettings, practiceLimit, type PracticeForTeacher, type PracticeSettings } from "@/lib/practice";
import { getPracticeSettings, listPracticeSince, PracticeNotReadyError, savePracticeSettings, setPracticeFlag } from "@/lib/practiceStore";
import { compareNumber, isOpen, openStatus, parseExamples, validateProblem, type ProblemInput } from "@/lib/problemBank";
import { changedFields, parseProblemCsv, resolveOpenAt } from "@/lib/problemCsv";
import { deleteProblem, listAllProblems, listOpenProblems, saveProblem } from "@/lib/problemStore";
import { getUserProfile } from "@/lib/auth";
import { listSolvedPractice } from "@/lib/practiceStore";
import { computeAchievements, unitProblemsOf, type AchievementStatus } from "@/lib/achievements";
import { buildJourney, type Journey } from "@/lib/journey";
import { allowedSubjects, SUBJECTS } from "@/lib/problems";
import type { Reflection } from "@/lib/reflection";
import { listMyReflections, listReflectionsByDate } from "@/lib/reflectionStore";
import { getMyJourneyData, getReplayDataById, submissionExists } from "@/lib/submissions";
import { MAX_NOTES_PER_SUBMISSION, validateNote } from "@/lib/timelineNotes";
import { countNotes, deleteNote, insertNote, listMyNotes, listNotesForSubmission, updateNote } from "@/lib/timelineNoteStore";
import type { NoteResult, ReplayResult } from "../student/actions";
import { parseStudentCsv, planForExisting, type ExistingPlan, type ParsedRow } from "@/lib/studentCsv";
import { createStudents, findExistingAccounts, resetStudentPassword, setStudentSubjects } from "@/lib/teacher";

export type ResetResult = { ok: true; password: string } | { ok: false; message: string };

/** 임의의 숫자 6자리 (000000~999999) */
const newPassword = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** 모든 교사용 서버 액션은 이것으로 로그인·역할을 다시 확인한다 */
const isTeacher = async () => (await getSession())?.role === "teacher";

/** 교사가 학생 비밀번호를 임의의 숫자 6자리로 새로 만든다. 만든 비밀번호는 이때 한 번만 보여 준다. */
export async function resetPassword(studentId: string): Promise<ResetResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };

  const id = String(studentId ?? "").trim();
  if (!id) return { ok: false, message: "학생을 고르세요." };

  const password = newPassword();
  try {
    const changed = await resetStudentPassword(id, password);
    if (!changed) return { ok: false, message: "그 학번의 학생 계정을 찾지 못했어요." };
  } catch (err) {
    console.error("비밀번호 초기화 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
  return { ok: true, password };
}

/** plan: 이미 있는 아이디면 어떻게 할지 (없으면 null = 새로 등록) */
export type PreviewRow = ParsedRow & { exists: boolean; plan: ExistingPlan | null };
export type PreviewResult = { ok: true; rows: PreviewRow[] } | { ok: false; message: string };

/** CSV 미리보기: 줄마다 오류와, 이미 있는 학번이면 어떻게 할지(과목 추가·그대로·건드리지 않음) 알려 준다. 아직 아무것도 저장하지 않는다. */
export async function previewStudents(csvText: string): Promise<PreviewResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const parsed = parseStudentCsv(String(csvText ?? ""));
  if (parsed.error) return { ok: false, message: parsed.error };
  try {
    const existing = await findExistingAccounts(parsed.rows.map((r) => r.student.id).filter(Boolean));
    return {
      ok: true,
      rows: parsed.rows.map((r) => {
        const acc = existing.get(r.student.id);
        return { ...r, exists: !!acc, plan: acc ? planForExisting(r.student, acc) : null };
      }),
    };
  } catch (err) {
    console.error("CSV 미리보기 오류:", err);
    return { ok: false, message: "학번을 확인하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export type ImportResult =
  | {
      ok: true;
      created: { id: string; name: string; password: string; generated: boolean }[];
      /** 이미 있는 학생에게 과목을 더한 것 */
      updated: { id: string; name: string; added: string[] }[];
      skipped: { line: number; id: string; reason: string }[];
    }
  | { ok: false; message: string };

/**
 * CSV로 학생 계정을 만든다. 미리보기와 같은 검사를 서버에서 다시 하고,
 * 이미 있는 학번은 같은 학생(이름이 같음)이면 과목만 더하고, 다른 칸(이름·비밀번호 등)은 절대 바꾸지 않는다.
 * 이름이 다르거나 교사 계정이면 다른 사람일 수 있어 건너뛴다. 오류 줄도 건너뛴다.
 * 비밀번호를 비운 학생은 숫자 6자리를 만들어 준다.
 */
export async function importStudents(csvText: string): Promise<ImportResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const parsed = parseStudentCsv(String(csvText ?? ""));
  if (parsed.error) return { ok: false, message: parsed.error };

  const skipped: { line: number; id: string; reason: string }[] = [];
  let created: { id: string; name: string; password: string; generated: boolean }[] = [];
  const updated: { id: string; name: string; added: string[] }[] = [];
  try {
    const existing = await findExistingAccounts(parsed.rows.map((r) => r.student.id).filter(Boolean));
    const toCreate = parsed.rows.filter((r) => {
      if (r.error) {
        skipped.push({ line: r.line, id: r.student.id, reason: r.error });
        return false;
      }
      const acc = existing.get(r.student.id);
      if (!acc) return true;
      const plan = planForExisting(r.student, acc);
      if (plan.kind === "add") updated.push({ id: r.student.id, name: r.student.name, added: plan.add });
      else skipped.push({ line: r.line, id: r.student.id, reason: plan.kind === "same" ? "이미 있음 (바꿀 것 없음)" : plan.reason });
      return false;
    });
    // 같은 학생에게 과목 더하기 (과목 칸만 바꾼다)
    for (const u of [...updated]) {
      const acc = existing.get(u.id)!;
      const plan = planForExisting(parsed.rows.find((r) => r.student.id === u.id)!.student, acc);
      if (plan.kind !== "add" || !(await setStudentSubjects(u.id, plan.next))) updated.splice(updated.indexOf(u), 1);
    }
    const withPasswords = toCreate.map(({ student: s }) => ({
      ...s,
      generated: !s.password,
      password: s.password || newPassword(),
    }));
    const done = withPasswords.length
      ? await createStudents(
          withPasswords.map((s) => ({
            id: s.id,
            name: s.name,
            grade: s.grade,
            class: s.class,
            programming_grade: s.programmingGrade,
            programming_class: s.programmingClass,
            subjects: s.subjects,
            password: s.password,
          })),
        )
      : new Set<string>();
    // 확인과 등록 사이에 누가 같은 학번을 만들었으면 건너뛴 것으로 알려 준다
    for (const [i, s] of withPasswords.entries()) {
      if (!done.has(s.id)) skipped.push({ line: toCreate[i].line, id: s.id, reason: "이미 있는 학번" });
    }
    created = withPasswords
      .filter((s) => done.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, password: s.password, generated: s.generated }));
  } catch (err) {
    console.error("CSV 등록 오류:", err);
    return { ok: false, message: "등록하지 못했어요. 잠시 후 다시 시도하세요." };
  }

  skipped.sort((a, b) => a.line - b.line);
  if (created.length || updated.length) refresh(); // 아래 학생 목록을 새로 불러온다
  return { ok: true, created, updated, skipped };
}

export type ProblemResult = { ok: true; message: string } | { ok: false; message: string };

/** 문제 저장 (id가 없으면 새 문제). 공개 시각은 그대로 저장하고, 학생 화면에서는 서버 시계로 공개 여부를 판단한다 */
export async function saveProblemAction(id: number | null, input: ProblemInput): Promise<ProblemResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const difficulty = Number(input.difficulty);
  const p: ProblemInput = {
    subject: String(input.subject ?? ""),
    number: String(input.number ?? "").trim(),
    title: String(input.title ?? ""),
    difficulty: input.difficulty === null || input.difficulty === undefined ? null : difficulty,
    description: String(input.description ?? ""),
    conditions: String(input.conditions ?? ""),
    examples: parseExamples(input.examples),
    goal: String(input.goal ?? ""),
    challenge: String(input.challenge ?? ""),
    starterCode: String(input.starterCode ?? ""),
    openAt: input.openAt ? new Date(input.openAt).toISOString() : null,
  };
  const invalid = validateProblem(p);
  if (invalid) return { ok: false, message: invalid };
  try {
    const result = await saveProblem(id, p);
    if (result === "duplicate") return { ok: false, message: `${p.subject} ${p.number}번 문제가 이미 있어요.` };
    if (result === "fields-missing") {
      return { ok: false, message: "난이도·조건·예시 칸이 아직 없어요. Supabase에서 004_problem_fields.sql을 실행해 주세요." };
    }
  } catch (err) {
    console.error("문제 저장 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
  refresh();
  return { ok: true, message: `${p.subject} ${p.number}번 문제를 저장했어요.` };
}

/** 문제 삭제. 이미 낸 제출(submissions)은 그대로 남는다 */
export async function deleteProblemAction(id: number): Promise<ProblemResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  try {
    await deleteProblem(id);
  } catch (err) {
    console.error("문제 삭제 오류:", err);
    return { ok: false, message: "지우지 못했어요. 잠시 후 다시 시도하세요." };
  }
  refresh();
  return { ok: true, message: "문제를 지웠어요." };
}

export type ProblemPreviewRow = {
  line: number;
  subject: string;
  number: string;
  title: string;
  difficulty: number | null;
  exampleCount: number;
  openText: string;
  /** new: 새 문제, update: 바뀌는 칸 있음, same: 그대로, error: 건너뜀 */
  status: "new" | "update" | "same" | "error";
  changes: string[];
  /** 공개 중이던 문제가 비공개로 바뀌는지 (실수 방지 경고) */
  willHide: boolean;
  error: string | null;
  /** 반영될 내용 (미리보기에서 "보기"로 학생 화면처럼 보여 줌) */
  problem: ProblemInput;
};

export type ProblemImportPreview = { ok: true; rows: ProblemPreviewRow[] } | { ok: false; message: string };

/** CSV를 기존 문제와 비교해 무엇이 바뀌는지 미리 보여 준다 (아직 저장하지 않음) */
async function planProblemImport(csvText: string) {
  const parsed = parseProblemCsv(String(csvText ?? ""));
  if (parsed.error) return { error: parsed.error } as const;
  const { problems, tableReady, fieldsReady } = await listAllProblems();
  if (!tableReady || !fieldsReady) {
    return { error: "먼저 Supabase에서 003_problems.sql과 004_problem_fields.sql을 실행해 주세요." } as const;
  }
  const now = new Date();
  const plan = parsed.rows.map((r) => {
    const existing = problems.find((p) => p.subject === r.input.subject && p.number === r.input.number);
    const next: ProblemInput = { ...r.input, openAt: resolveOpenAt(r.open, existing, now) };
    const changes = existing ? changedFields(existing, next) : [];
    const status: ProblemPreviewRow["status"] = r.error ? "error" : !existing ? "new" : changes.length ? "update" : "same";
    const wasOpen = !!existing?.openAt && new Date(existing.openAt) <= now;
    return { row: r, existing, next, changes, status, willHide: status === "update" && wasOpen && !isOpen(next, now) };
  });
  return { plan, now } as const;
}

const openText = (p: ProblemInput, now: Date) => {
  const s = openStatus(p, now);
  return s.kind === "scheduled" ? s.text.replace(" 공개 예정", " 공개") : s.text;
};

export async function previewProblemImport(csvText: string): Promise<ProblemImportPreview> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  try {
    const result = await planProblemImport(csvText);
    if ("error" in result) return { ok: false, message: result.error! };
    return {
      ok: true,
      rows: result.plan.map(({ row, next, changes, status, willHide }) => ({
        line: row.line,
        subject: next.subject,
        number: next.number,
        title: next.title,
        difficulty: next.difficulty,
        exampleCount: next.examples.length,
        openText: openText(next, result.now),
        status,
        changes,
        willHide,
        error: row.error,
        problem: next,
      })),
    };
  } catch (err) {
    console.error("문제 CSV 미리보기 오류:", err);
    return { ok: false, message: "확인하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export type ProblemImportResult = { ok: true; created: number; updated: number; skipped: number } | { ok: false; message: string };

/** CSV 반영: 새 문제는 만들고, 있는 문제는 바뀐 칸만이 아니라 CSV 내용으로 통째로 바꾼다. 오류 줄은 건너뜀 */
export async function importProblems(csvText: string): Promise<ProblemImportResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  let created = 0;
  let updated = 0;
  let skipped = 0;
  try {
    const result = await planProblemImport(csvText);
    if ("error" in result) return { ok: false, message: result.error! };
    for (const { existing, next, status } of result.plan) {
      if (status === "error") skipped++;
      if (status !== "new" && status !== "update") continue;
      const saved = await saveProblem(existing?.id ?? null, next);
      if (saved !== "ok") {
        skipped++;
        continue;
      }
      if (status === "new") created++;
      else updated++;
    }
  } catch (err) {
    console.error("문제 CSV 반영 오류:", err);
    return { ok: false, message: `반영하다 멈췄어요 (새 문제 ${created}개, 고친 문제 ${updated}개까지 저장됨). 잠시 후 다시 올려 주세요.` };
  }
  if (created || updated) refresh();
  return { ok: true, created, updated, skipped };
}

export type ReflectionsResult = { ok: true; ready: boolean; reflections: Reflection[] } | { ok: false; message: string };

/** 한 날짜·과목에 학생들이 쓴 오늘의 성찰 */
export async function loadReflections(classDate: string, subject: string): Promise<ReflectionsResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(classDate))) return { ok: false, message: "날짜를 고르세요." };
  try {
    return { ok: true, ...(await listReflectionsByDate(classDate, String(subject))) };
  } catch (err) {
    console.error("성찰 조회 오류:", err);
    return { ok: false, message: "성찰을 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export type StudentJourneyResult =
  | { ok: true; journey: Journey; reflections: Reflection[]; achievements: AchievementStatus[] }
  | { ok: false; message: string };

/** 교사용: 한 학생의 학습 여정 (학생이 보는 화면과 같은 내용) */
export async function loadStudentJourney(studentId: string): Promise<StudentJourneyResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  try {
    const profile = await getUserProfile(String(studentId ?? ""));
    if (!profile || profile.role !== "student") return { ok: false, message: "학생을 찾지 못했어요." };
    const [{ summaries, records, today }, mine, open, notes, practice] = await Promise.all([
      getMyJourneyData(profile),
      listMyReflections(profile.id),
      listOpenProblems(allowedSubjects(profile.subjects)),
      listMyNotes(profile.id),
      listSolvedPractice(profile.id),
    ]);
    const achievements = computeAchievements(
      records,
      mine.reflections.map((r) => ({ date: r.classDate, savedAt: r.updatedAt })),
      unitProblemsOf(open),
      notes.notes,
      practice,
    );
    return { ok: true, journey: buildJourney(summaries, today), reflections: mine.reflections, achievements };
  } catch (err) {
    console.error("학습 여정 조회 오류:", err);
    return { ok: false, message: "학습 여정을 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 교사용: 아무 학생 제출의 작성 과정 기록 (재생용) + 학생 메모·교사 피드백 */
export async function loadStudentReplay(submissionId: number): Promise<ReplayResult> {
  const session = await getSession();
  if (session?.role !== "teacher") return { ok: false, error: "교사 계정으로 다시 로그인하세요." };
  if (!Number.isInteger(submissionId)) return { ok: false, error: "제출을 찾지 못했어요." };
  try {
    const found = await getReplayDataById(submissionId);
    if (!found) return { ok: false, error: "제출을 찾지 못했어요." };
    const { owner, ...data } = found;
    const [notes, chats, review] = await Promise.all([
      listNotesForSubmission(submissionId, session.id),
      chatsForReplay(owner, data.log),
      getReview(submissionId),
    ]);
    return { ok: true, data: { ...data, notes, chats, review } };
  } catch (err) {
    console.error("재생 기록 오류:", err);
    return { ok: false, error: "기록을 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 교사 피드백: 학생 제출의 재생 그 순간에 남기거나(id 없음) 고친다(id 있음, 내가 쓴 것만) */
export async function saveFeedbackNote(input: { submissionId: number; at: number; text: string; id?: number }): Promise<NoteResult> {
  const session = await getSession();
  if (session?.role !== "teacher") return { ok: false, error: "교사 계정으로 다시 로그인하세요." };
  const text = String(input.text ?? "").trim();
  const invalid = validateNote(text);
  if (invalid) return { ok: false, error: invalid };
  try {
    if (input.id !== undefined) {
      const note = await updateNote(session.id, Number(input.id), text);
      return note ? { ok: true, note } : { ok: false, error: "피드백을 찾지 못했어요." };
    }
    if (!Number.isInteger(input.submissionId) || !Number.isFinite(input.at) || !(await submissionExists(input.submissionId))) {
      return { ok: false, error: "제출을 찾지 못했어요." };
    }
    if ((await countNotes(input.submissionId)) >= MAX_NOTES_PER_SUBMISSION) {
      return { ok: false, error: `한 제출에 메모는 ${MAX_NOTES_PER_SUBMISSION}개까지 남길 수 있어요.` };
    }
    return { ok: true, note: await insertNote(session.id, "teacher", input.submissionId, input.at, text) };
  } catch (err) {
    console.error("피드백 저장 오류:", err);
    return { ok: false, error: "피드백을 저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 교사 피드백 지우기 (내가 쓴 것만) */
export async function deleteFeedbackNote(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (session?.role !== "teacher") return { ok: false, error: "교사 계정으로 다시 로그인하세요." };
  try {
    return (await deleteNote(session.id, Number(id))) ? { ok: true } : { ok: false, error: "피드백을 찾지 못했어요." };
  } catch (err) {
    console.error("피드백 삭제 오류:", err);
    return { ok: false, error: "피드백을 지우지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export type TeacherChatsResult =
  | { ok: true; ready: boolean; chats: AiChat[]; reviews: AiReview[]; practice: PracticeForTeacher[] }
  | { ok: false; message: string };

/** 학생 AI 대화 열람 (최근 days일). 미성년자 보호: 교사는 모든 학생의 AI 대화를 볼 수 있다 */
export async function loadAiChats(days: number): Promise<TeacherChatsResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const span = [7, 30, 180].includes(Number(days)) ? Number(days) : 7;
  try {
    const since = new Date(Date.now() - span * 86_400_000).toISOString();
    const [chats, reviews, practice] = await Promise.all([listChatsSince(since), listReviewsSince(since), listPracticeSince(since)]);
    return { ok: true, ...chats, reviews: reviews.reviews, practice: practice.items };
  } catch (err) {
    console.error("AI 대화 열람 오류:", err);
    return { ok: false, message: "AI 대화를 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 부적절한 대화 표시하기(flag=true)·풀기(false) */
export async function flagAiChat(id: number, flag: boolean): Promise<{ ok: boolean; message?: string }> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  try {
    const done = await setChatFlag(Number(id), flag ? "teacher" : null, flag ? "교사가 표시함" : null);
    return done ? { ok: true } : { ok: false, message: "대화를 찾지 못했어요." };
  } catch (err) {
    console.error("AI 대화 표시 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 되돌아보기 부적절 표시하기(flag=true)·풀기(false) */
export async function flagAiReview(id: number, flag: boolean): Promise<{ ok: boolean; message?: string }> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  try {
    return (await setReviewFlag(Number(id), flag ? "teacher" : null)) ? { ok: true } : { ok: false, message: "찾지 못했어요." };
  } catch (err) {
    console.error("되돌아보기 표시 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 학생 연습 문제 부적절 표시하기(flag=true)·풀기(false) */
export async function flagPractice(id: number, flag: boolean): Promise<{ ok: boolean; message?: string }> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  try {
    return (await setPracticeFlag(Number(id), flag ? "teacher" : null)) ? { ok: true } : { ok: false, message: "찾지 못했어요." };
  } catch (err) {
    console.error("연습 문제 표시 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 설정 탭: 과목별 연습 모드 설정 (ready=false면 015 실행 전) */
export async function loadPracticeSettings(): Promise<
  { ok: true; ready: boolean; settings: PracticeSettings[]; limit: number } | { ok: false; message: string }
> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  try {
    return { ok: true, ...(await getPracticeSettings(Object.keys(SUBJECTS))), limit: practiceLimit() };
  } catch (err) {
    console.error("연습 모드 설정 조회 오류:", err);
    return { ok: false, message: "연습 모드 설정을 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 과목의 연습 모드 설정 저장: 켜고 끄기, 쓸 수 있는 개념(문법 범위), 범위 안내 */
export async function saveSubjectPractice(input: PracticeSettings): Promise<{ ok: true; settings: PracticeSettings } | { ok: false; message: string }> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const subject = String(input?.subject ?? "");
  if (!Object.keys(SUBJECTS).includes(subject)) return { ok: false, message: "과목이 맞지 않아요." };
  const settings = normalizeSettings(input, subject);
  if (!settings) return { ok: false, message: "개념은 30개, 개념 이름은 40자, 안내는 500자까지 쓸 수 있어요." };
  if (settings.enabled && !settings.concepts.length) return { ok: false, message: "켜 두려면 개념을 하나 이상 골라 주세요." };
  try {
    await savePracticeSettings(settings);
    return { ok: true, settings };
  } catch (err) {
    if (err instanceof PracticeNotReadyError) return { ok: false, message: "연습 모드 설정을 저장하려면 Supabase에서 015 SQL을 먼저 실행해 주세요." };
    console.error("연습 모드 설정 저장 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/* ───────────── 채점 ───────────── */

export type GradingResult =
  | {
      ok: true;
      rows: GradingRow[];
      total: number;
      rubric: { ready: boolean; parts: RubricPart[] };
      classes: string[];
      /** 과목별 채점 대기 수 */
      pending: Record<string, number>;
    }
  | { ok: false; message: string };


/** 채점 목록 한 쪽 + 이 과목의 채점 기준 + 반 목록 */
export async function loadGrading(filter: GradingFilter, page: number): Promise<GradingResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const f: GradingFilter = {
    subject: String(filter.subject ?? ""),
    cls: String(filter.cls ?? ""),
    problem: String(filter.problem ?? ""),
    query: String(filter.query ?? "").slice(0, 50),
    ungradedOnly: !!filter.ungradedOnly,
  };
  if (!f.subject) return { ok: false, message: "과목을 고르세요." };
  if (f.subject === "(과목 없음)") f.subject = "";
  try {
    const [list, rubric, classes, pending] = await Promise.all([
      listForGrading(f, Math.max(1, Math.floor(Number(page) || 1)), GRADING_PAGE_SIZE),
      getRubric(f.subject),
      classesWithSubmissions(f.subject),
      pendingBySubject(),
    ]);
    return { ok: true, ...list, rubric, classes, pending };
  } catch (err) {
    console.error("채점 목록 오류:", err);
    return { ok: false, message: "제출을 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export type GradeResult = { ok: true; row: GradingRow } | { ok: false; message: string };

/** 점수·감점 이유 저장. rubric: 이 제출을 채점한 기준 (이미 채점한 제출은 그때 기준, 새로 채점하면 지금 과목 기준) */
export async function saveGrade(id: number, rubric: RubricPart[], scores: number[], feedback: string): Promise<GradeResult> {
  const session = await getSession();
  if (session?.role !== "teacher") return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const r = validateRubric(rubric);
  if (!r.ok) return { ok: false, message: r.error };
  const checked = validateScores(r.parts, scores);
  if (!checked.ok) return { ok: false, message: checked.error };
  const text = String(feedback ?? "").trim();
  if (text.length > MAX_FEEDBACK) return { ok: false, message: `감점 이유는 ${MAX_FEEDBACK}자까지 쓸 수 있어요.` };
  try {
    const row = await saveScores(Number(id), checked.sheet, checked.total, text, session.id);
    return row ? { ok: true, row } : { ok: false, message: "제출을 찾지 못했어요." };
  } catch (err) {
    if (err instanceof RubricsNotReadyError) {
      return { ok: false, message: "과목별 채점 기준을 쓰려면 Supabase에서 012 SQL을 먼저 실행해 주세요." };
    }
    console.error("채점 저장 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 오답 처리(reason) 또는 해제(null). 점수가 있는 제출은 오답 처리할 수 없다 (v1과 같음) */
export async function setWrong(id: number, reason: string | null): Promise<GradeResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const text = reason === null ? null : String(reason).trim();
  if (text !== null && !text) return { ok: false, message: "오답 이유를 적어 주세요." };
  if (text && text.length > MAX_WRONG_REASON) return { ok: false, message: `오답 이유는 ${MAX_WRONG_REASON}자까지 쓸 수 있어요.` };
  try {
    if (text !== null) {
      const total = await getScoreTotal(Number(id));
      if (total === undefined) return { ok: false, message: "제출을 찾지 못했어요." };
      if (!canMarkWrong(total)) return { ok: false, message: "점수가 있는 제출은 오답 처리할 수 없어요. 점수를 0으로 저장한 뒤 해 주세요." };
    }
    const row = await setWrongReason(Number(id), text);
    return row ? { ok: true, row } : { ok: false, message: "제출을 찾지 못했어요." };
  } catch (err) {
    console.error("오답 처리 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 제출 삭제 (v1과 같음, 되돌릴 수 없음) */
export async function removeSubmission(id: number): Promise<{ ok: boolean; message?: string }> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  try {
    return (await deleteSubmission(Number(id))) ? { ok: true } : { ok: false, message: "제출을 찾지 못했어요." };
  } catch (err) {
    console.error("제출 삭제 오류:", err);
    return { ok: false, message: "지우지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 과목의 채점 기준 저장 (이미 채점한 제출은 그때 기준 그대로) */
export async function saveSubjectRubric(subject: string, parts: RubricPart[]): Promise<{ ok: true; parts: RubricPart[] } | { ok: false; message: string }> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  if (!Object.keys(SUBJECTS).includes(String(subject))) return { ok: false, message: "과목이 맞지 않아요." };
  const r = validateRubric(parts);
  if (!r.ok) return { ok: false, message: r.error };
  try {
    await saveRubric(subject, r.parts);
    return { ok: true, parts: r.parts };
  } catch (err) {
    if (err instanceof RubricsNotReadyError) return { ok: false, message: "채점 기준을 저장하려면 Supabase에서 012 SQL을 먼저 실행해 주세요." };
    console.error("채점 기준 저장 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 설정 탭: 모든 과목의 채점 기준 (ready=false면 012 실행 전) */
export async function loadRubrics(): Promise<
  { ok: true; ready: boolean; rubrics: { subject: string; parts: RubricPart[] }[] } | { ok: false; message: string }
> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  try {
    const list = await Promise.all(Object.keys(SUBJECTS).map(async (subject) => ({ subject, ...(await getRubric(subject)) })));
    return { ok: true, ready: list.every((r) => r.ready), rubrics: list.map(({ subject, parts }) => ({ subject, parts })) };
  } catch (err) {
    console.error("채점 기준 조회 오류:", err);
    return { ok: false, message: "채점 기준을 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export type DraftResult = { ok: true; draft: GradingDraft; reused: boolean; saved: boolean } | { ok: false; message: string };

/**
 * AI 채점 초안 (교사 채점 보조). 지금 채점 기준(영역·배점·설명), 문제, 학생 코드·설명, 작성 과정 요약을 AI에 보낸다.
 * 같은 기준으로 만든 초안이 있으면 AI를 다시 부르지 않는다(again=true면 새로 만든다). 학생 이름·아이디는 보내지 않는다.
 */
export async function makeGradingDraft(submissionId: number, rubric: RubricPart[], again = false): Promise<DraftResult> {
  const session = await getSession();
  if (session?.role !== "teacher") return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const r = validateRubric(rubric);
  if (!r.ok) return { ok: false, message: r.error };
  const id = Number(submissionId);
  try {
    const sub = await submissionForDraft(id);
    if (!sub) return { ok: false, message: "제출을 찾지 못했어요." };
    // 설명이 빠진 영역(설명을 적기 전의 채점 기준)은 지금 과목 기준의 설명으로 채운다
    r.parts = withDescs(r.parts, (await getRubric(sub.subject)).parts);
    const previous = await latestDraft(id);
    if (!again && previous.draft && draftMatches(previous.draft.parts, r.parts)) {
      return { ok: true, draft: previous.draft, reused: true, saved: true };
    }
    const { problems } = await listAllProblems();
    const problem = problems.find((p) => p.subject === sub.subject && p.number === sub.problem);
    const hasLog = validEntries(sub.edit_log).length > 0;
    const reply = await draftGrade({
      problemText: problem ? problemForAi(problem) : `${sub.problem}번 문제 (문제 설명 없음)`,
      rubricText: r.parts.map((p) => `- ${p.name} (${p.max}점)${p.desc ? `: ${p.desc}` : ""}`).join("\n"),
      code: sub.code ?? "",
      description: sub.description ?? "",
      processText: hasLog ? processSummaryText(summarizeProcess(sub.init_code ?? "", sub.edit_log)) : "(작성 과정 기록 없음)",
    });
    const parsed = toDraft(reply.raw, r.parts);
    if (!parsed) return { ok: false, message: "AI가 채점 기준에 맞는 초안을 만들지 못했어요. 다시 눌러 주세요." };
    const row = {
      submissionId: id,
      teacherId: session.id,
      ...parsed,
      model: reply.model,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
    };
    try {
      return { ok: true, draft: await insertDraft(row), reused: false, saved: true };
    } catch (err) {
      // 013 실행 전: 초안은 쓰되 기록만 못 남긴다
      if (err instanceof DraftsNotReadyError) {
        return { ok: true, draft: { id: 0, submissionId: id, ...parsed, createdAt: new Date().toISOString() }, reused: false, saved: false };
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return { ok: false, message: "AI 키나 모델이 설정되지 않았어요." };
    if (err instanceof AiRefusedError) return { ok: false, message: "AI가 이 제출의 초안을 만들지 않았어요." };
    console.error("채점 초안 오류:", err);
    return { ok: false, message: "초안을 만들지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export type ClassStatsResult =
  | { ok: true; years: number[]; year: number; rows: StatRow[]; problemOrder: string[] }
  | { ok: false; message: string };

/** 반별 현황: 이 과목·연도의 제출 요약(작성 기록은 요약만) + 고를 수 있는 연도 */
export async function loadClassStats(subject: string, year?: number): Promise<ClassStatsResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  if (!(String(subject) in SUBJECTS)) return { ok: false, message: "과목을 고르세요." };
  try {
    const years = await yearsWithSubmissions(subject);
    const thisYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
    const picked = year && Number.isInteger(Number(year)) ? Number(year) : (years[0] ?? thisYear);
    const [{ rows }, { problems }] = await Promise.all([loadStatRows(subject, picked), listAllProblems()]);
    const order = [...new Set([...Object.keys(SUBJECTS[subject as keyof typeof SUBJECTS] ?? {}), ...problems.filter((p) => p.subject === subject).map((p) => p.number)])].sort(
      compareNumber,
    );
    return { ok: true, years: years.length ? years : [picked], year: picked, rows, problemOrder: order };
  } catch (err) {
    console.error("반별 현황 오류:", err);
    return { ok: false, message: "반별 현황을 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}
