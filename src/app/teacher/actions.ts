"use server";

import { refresh } from "next/cache";
import { randomInt } from "node:crypto";
import { getSession } from "@/lib/session";
import { isOpen, openStatus, parseExamples, validateProblem, type ProblemInput } from "@/lib/problemBank";
import { changedFields, parseProblemCsv, resolveOpenAt } from "@/lib/problemCsv";
import { deleteProblem, listAllProblems, listOpenProblems, saveProblem } from "@/lib/problemStore";
import { getUserProfile } from "@/lib/auth";
import { computeAchievements, unitProblemsOf, type AchievementStatus } from "@/lib/achievements";
import { buildJourney, type Journey } from "@/lib/journey";
import { allowedSubjects } from "@/lib/problems";
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
    const [{ summaries, records, today }, mine, open, notes] = await Promise.all([
      getMyJourneyData(profile),
      listMyReflections(profile.id),
      listOpenProblems(allowedSubjects(profile.subjects)),
      listMyNotes(profile.id),
    ]);
    const achievements = computeAchievements(
      records,
      mine.reflections.map((r) => ({ date: r.classDate, savedAt: r.updatedAt })),
      unitProblemsOf(open),
      notes.notes,
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
    const data = await getReplayDataById(submissionId);
    if (!data) return { ok: false, error: "제출을 찾지 못했어요." };
    return { ok: true, data: { ...data, notes: await listNotesForSubmission(submissionId, session.id) } };
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
