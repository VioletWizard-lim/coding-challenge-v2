"use server";

import { refresh } from "next/cache";
import { AiNotConfiguredError, AiRefusedError, askHelper } from "@/lib/ai";
import { dailyLimit, dropUnknownRefs, HISTORY_TURNS, momentsUsed, problemForAi, validateQuestion, type AiChat } from "@/lib/aiChat";
import { AiChatsNotReadyError, countTodayChats, insertChat, listChatsForProblem, setChatFlag } from "@/lib/aiChatStore";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { saveAchievementsSeen } from "@/lib/achievementStore";
import { getUserProfile } from "@/lib/auth";
import { isValidLog } from "@/lib/editLog";
import { allowedSubjects } from "@/lib/problems";
import { findOpenProblem } from "@/lib/problemStore";
import { normalizeReflection, validateReflection, type Reflection, type ReflectionInput } from "@/lib/reflection";
import { saveTodayReflection } from "@/lib/reflectionStore";
import { processSummaryText, summarizeProcess } from "@/lib/process-summary";
import { getSession } from "@/lib/session";
import { getReplayData, insertSubmission, isMySubmission, type ReplayData } from "@/lib/submissions";
import { MAX_NOTES_PER_SUBMISSION, validateNote, type NotesBundle, type TimelineNote } from "@/lib/timelineNotes";
import { countNotes, deleteNote, insertNote, listNotesForSubmission, updateNote } from "@/lib/timelineNoteStore";

export type SubmitInput = {
  subject: string;
  problem: string;
  description: string;
  code: string;
  init: string;
  log: unknown;
};

export type SubmitResult = { ok: true } | { ok: false; error: string };

const MAX_CODE = 100_000;
const MAX_DESCRIPTION = 5_000;

/** 학생 제출. 브라우저에서 온 값은 모두 서버에서 다시 확인한다. */
export async function submitCode(input: SubmitInput): Promise<SubmitResult> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인한 뒤 제출하세요." };

  const code = String(input.code ?? "");
  const description = String(input.description ?? "").trim();
  if (!code.trim()) return { ok: false, error: "코드를 입력하세요." };
  if (!description) return { ok: false, error: "코드 설명을 입력하세요." };
  if (code.length > MAX_CODE || description.length > MAX_DESCRIPTION) {
    return { ok: false, error: "코드나 설명이 너무 길어요." };
  }
  if (!isValidLog(input.log)) return { ok: false, error: "작성 기록 형식이 맞지 않아요. 새로고침 후 다시 제출하세요." };

  try {
    const profile = await getUserProfile(session.id);
    if (!profile) return { ok: false, error: "다시 로그인한 뒤 제출하세요." };
    if (!allowedSubjects(profile.subjects).includes(input.subject)) {
      return { ok: false, error: "과목이 맞지 않아요." };
    }
    // 공개된 문제만 제출할 수 있다 (공개 시각은 서버 시계로 확인)
    if (!(await findOpenProblem(input.subject, input.problem))) {
      return { ok: false, error: "아직 공개되지 않았거나 없는 문제예요." };
    }
    await insertSubmission({
      profile,
      subject: input.subject,
      problem: input.problem,
      code,
      description,
      initCode: String(input.init ?? ""),
      editLog: input.log,
    });
  } catch (err) {
    console.error("제출 오류:", err);
    return { ok: false, error: "제출하지 못했어요. 잠시 후 다시 시도하세요." };
  }

  refresh(); // "내 기록 다시 보기"를 새로 불러온다
  return { ok: true };
}

/** 재생 기록 + 그 제출의 타임라인 메모·피드백 */
export type ReplayResult = { ok: true; data: ReplayData & { notes: NotesBundle } } | { ok: false; error: string };

/** 내 제출의 작성 과정 기록 (재생용). 다른 학생의 제출은 볼 수 없다. */
export async function loadMyReplay(submissionId: number): Promise<ReplayResult> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  if (!Number.isInteger(submissionId)) return { ok: false, error: "제출을 찾지 못했어요." };
  try {
    const profile = await getUserProfile(session.id);
    const data = profile ? await getReplayData(submissionId, profile) : null;
    if (!data) return { ok: false, error: "제출을 찾지 못했어요." };
    return { ok: true, data: { ...data, notes: await listNotesForSubmission(submissionId, session.id) } };
  } catch (err) {
    console.error("재생 기록 오류:", err);
    return { ok: false, error: "기록을 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export type ReflectionResult = { ok: true; reflection: Reflection } | { ok: false; error: string };

/** 오늘의 성찰 저장. 날짜는 서버 시계(한국 시간)로 정하므로 지난 날 성찰은 고칠 수 없다. */
export async function saveMyReflection(input: ReflectionInput): Promise<ReflectionResult> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인한 뒤 저장하세요." };
  const reflection = normalizeReflection(input);
  const invalid = validateReflection(reflection);
  if (invalid) return { ok: false, error: invalid };
  try {
    const profile = await getUserProfile(session.id);
    if (!profile) return { ok: false, error: "다시 로그인한 뒤 저장하세요." };
    if (!allowedSubjects(profile.subjects).includes(reflection.subject)) return { ok: false, error: "과목이 맞지 않아요." };
    const saved = await saveTodayReflection(profile, reflection);
    refresh(); // 학습 여정의 날짜별 기록에도 바로 보이게
    return { ok: true, reflection: saved };
  } catch (err) {
    console.error("성찰 저장 오류:", err);
    return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

const ACHIEVEMENT_KEY = new RegExp(`^(${ACHIEVEMENTS.map((a) => a.code).join("|")}):\\d$`);

/** 새 업적 알림을 띄운 뒤, 이미 본 업적 목록을 DB에 남긴다 (어느 컴퓨터에서든 알림이 한 번만 뜨게) */
export async function markAchievementsSeen(keys: string[]): Promise<void> {
  const session = await getSession();
  if (!session || session.role !== "student" || !Array.isArray(keys)) return;
  const valid = [...new Set(keys.filter((k) => typeof k === "string" && ACHIEVEMENT_KEY.test(k)))].slice(0, 200);
  try {
    await saveAchievementsSeen(session.id, valid);
  } catch (err) {
    console.error("업적 알림 기록 오류:", err);
  }
}

export type NoteResult = { ok: true; note: TimelineNote } | { ok: false; error: string };

/** 내 제출의 재생에 메모를 남기거나(id 없음) 고친다(id 있음). 다른 학생 제출에는 남길 수 없다. */
export async function saveMyNote(input: { submissionId: number; at: number; text: string; id?: number }): Promise<NoteResult> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  const text = String(input.text ?? "").trim();
  const invalid = validateNote(text);
  if (invalid) return { ok: false, error: invalid };
  try {
    if (input.id !== undefined) {
      const note = await updateNote(session.id, Number(input.id), text);
      return note ? { ok: true, note } : { ok: false, error: "메모를 찾지 못했어요." };
    }
    const profile = await getUserProfile(session.id);
    if (!Number.isInteger(input.submissionId) || !Number.isFinite(input.at)) return { ok: false, error: "제출을 찾지 못했어요." };
    if (!profile || !(await isMySubmission(input.submissionId, profile))) return { ok: false, error: "제출을 찾지 못했어요." };
    if ((await countNotes(input.submissionId)) >= MAX_NOTES_PER_SUBMISSION) {
      return { ok: false, error: `한 제출에 메모는 ${MAX_NOTES_PER_SUBMISSION}개까지 남길 수 있어요.` };
    }
    const note = await insertNote(session.id, "student", input.submissionId, input.at, text);
    refresh(); // 업적("막힌 곳 발견") 다시 계산
    return { ok: true, note };
  } catch (err) {
    console.error("메모 저장 오류:", err);
    return { ok: false, error: "메모를 저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 내 메모 지우기 */
export async function deleteMyNote(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  try {
    return (await deleteNote(session.id, Number(id))) ? { ok: true } : { ok: false, error: "메모를 찾지 못했어요." };
  } catch (err) {
    console.error("메모 삭제 오류:", err);
    return { ok: false, error: "메모를 지우지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/* ───────────── AI 도우미 ───────────── */

export type AskInput = {
  subject: string;
  problem: string;
  question: string;
  /** 질문 직전까지의 작성 기록 (브라우저 localStorage에 있는 것) */
  init: string;
  log: unknown;
  /** 기록 안의 질문 시각 (edit_log에 [at, "q"]로 남김) */
  at: number;
};

export type AskResult =
  | { ok: true; chat: AiChat; remaining: number }
  | { ok: false; error: string; remaining?: number; notReady?: boolean };

const MAX_LOG_EVENTS = 200_000;

/**
 * AI 도우미에게 묻는다. 서버가 작성 기록으로 과정 요약(process-summary)을 만들어 질문과 함께 보낸다.
 * 학생 이름·아이디는 AI에 보내지 않는다. 하루 질문 수는 학생마다 정해진 만큼만.
 */
export async function askAiHelper(input: AskInput): Promise<AskResult> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인한 뒤 물어보세요." };
  const question = String(input.question ?? "").trim();
  const invalid = validateQuestion(question);
  if (invalid) return { ok: false, error: invalid };
  if (!isValidLog(input.log) || (input.log as unknown[]).length > MAX_LOG_EVENTS || String(input.init ?? "").length > MAX_CODE) {
    return { ok: false, error: "작성 기록을 읽지 못했어요. 새로고침 후 다시 물어보세요." };
  }
  const at = Number.isFinite(input.at) ? Number(input.at) : Date.now();

  try {
    const profile = await getUserProfile(session.id);
    if (!profile) return { ok: false, error: "다시 로그인한 뒤 물어보세요." };
    if (!allowedSubjects(profile.subjects).includes(input.subject)) return { ok: false, error: "과목이 맞지 않아요." };
    const problem = await findOpenProblem(input.subject, input.problem);
    if (!problem) return { ok: false, error: "아직 공개되지 않았거나 없는 문제예요." };

    const limit = dailyLimit();
    const used = await countTodayChats(session.id);
    if (used >= limit) {
      return { ok: false, error: `오늘 질문 ${limit}번을 모두 썼어요. 내일 다시 물어볼 수 있어요.`, remaining: 0 };
    }

    // 과정 기록 요약: 마지막 성공 코드, 그 뒤 바뀐 줄, 반복된 오류, 멈춘 구간, 막힌 개념 (CLAUDE.md 규칙 1)
    const summary = summarizeProcess(String(input.init ?? ""), input.log, at);
    const history = await listChatsForProblem(session.id, input.subject, input.problem, HISTORY_TURNS);
    const reply = await askHelper({
      problemText: problemForAi(problem),
      processText: processSummaryText(summary),
      history: history.map((c) => ({ question: c.question, answer: c.answer })),
      question,
    });
    const answer = dropUnknownRefs(reply.text, summary.moments);
    const chat = await insertChat({
      userId: session.id,
      subject: input.subject,
      problem: input.problem,
      at,
      question,
      answer,
      moments: momentsUsed(answer, summary.moments),
      model: reply.model,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
    });
    return { ok: true, chat, remaining: Math.max(0, limit - used - 1) };
  } catch (err) {
    if (err instanceof AiChatsNotReadyError) {
      return { ok: false, notReady: true, error: "선생님이 AI 도우미를 준비하고 있어요. 조금만 기다려 주세요." };
    }
    if (err instanceof AiNotConfiguredError) return { ok: false, error: "선생님이 AI 도우미를 준비하고 있어요." };
    if (err instanceof AiRefusedError) return { ok: false, error: "AI가 이 질문에는 답하지 않았어요. 문제와 관련된 질문으로 다시 물어봐 주세요." };
    console.error("AI 도우미 오류:", err);
    return { ok: false, error: "AI가 답하지 못했어요. 잠시 후 다시 물어보세요." };
  }
}

export type ChatsResult =
  | { ok: true; chats: AiChat[]; remaining: number; limit: number }
  | { ok: false; error: string; notReady?: boolean };

/** 이 문제에서 나눈 AI 대화와 오늘 남은 질문 수 */
export async function loadMyAiChats(subject: string, problem: string): Promise<ChatsResult> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  try {
    const limit = dailyLimit();
    const [chats, used] = await Promise.all([
      listChatsForProblem(session.id, String(subject), String(problem)),
      countTodayChats(session.id),
    ]);
    return { ok: true, chats, remaining: Math.max(0, limit - used), limit };
  } catch (err) {
    if (err instanceof AiChatsNotReadyError) return { ok: false, notReady: true, error: "선생님이 AI 도우미를 준비하고 있어요." };
    console.error("AI 대화 조회 오류:", err);
    return { ok: false, error: "AI 대화를 불러오지 못했어요." };
  }
}

/** 이상한 AI 답을 선생님께 알린다 (내 대화만) */
export async function flagMyAiChat(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  try {
    const done = await setChatFlag(Number(id), "student", "학생이 이상한 답이라고 알림", session.id);
    return done ? { ok: true } : { ok: false, error: "대화를 찾지 못했어요." };
  } catch (err) {
    console.error("AI 대화 표시 오류:", err);
    return { ok: false, error: "알리지 못했어요. 잠시 후 다시 시도하세요." };
  }
}
