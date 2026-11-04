import "server-only";
import { db, fetchAll, type RangeQuery } from "./db";
import { kstDayStart, kstMonthStart, type AiChat, type Usage } from "./aiChat";
import type { HelpChat } from "./helpTrail";
import type { Moment } from "./process-summary";
import { validEntries } from "./replay";
import type { ReplayOwner } from "./submissions";

type ChatRow = {
  id: number;
  user_id: string;
  subject: string;
  problem: string;
  at_ms: number | null;
  question: string;
  answer: string;
  moments: unknown;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  flagged_by: string | null;
  flag_note: string | null;
  created_at: string;
};

const isMoment = (m: unknown): m is Moment =>
  !!m && typeof m === "object" && typeof (m as Moment).id === "string" && typeof (m as Moment).at === "number";

const fromRow = (r: ChatRow): AiChat => ({
  id: Number(r.id),
  userId: r.user_id,
  subject: r.subject,
  problem: r.problem,
  at: r.at_ms === null ? null : Number(r.at_ms),
  question: r.question,
  answer: r.answer,
  moments: Array.isArray(r.moments) ? r.moments.filter(isMoment) : [],
  flaggedBy: r.flagged_by === "student" || r.flagged_by === "teacher" ? r.flagged_by : null,
  flagNote: r.flag_note,
  createdAt: r.created_at,
  model: r.model,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
});

/** ai_chats 표가 없어서(010 실행 전) 생긴 오류인지 */
export const aiTableMissing = (err: unknown) => {
  const message = String((err as Error)?.message ?? err);
  return /ai_chats/.test(message) && /(does not exist|schema cache|not find)/i.test(message);
};

export class AiChatsNotReadyError extends Error {}

function check(error: { message: string } | null, what: string) {
  if (!error) return;
  if (aiTableMissing(error.message)) throw new AiChatsNotReadyError(error.message);
  throw new Error(`${what}: ${error.message}`);
}

/** 오늘(한국 시간) 이 학생이 물어본 횟수 */
export async function countTodayChats(userId: string): Promise<number> {
  const { count, error } = await db()
    .from("ai_chats")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", kstDayStart());
  check(error, "AI 대화 수 조회 실패");
  return count ?? 0;
}

/** 이 학생이 이 문제에서 나눈 대화 (오래된 것부터). limit을 주면 최근 것 limit개만 */
export async function listChatsForProblem(userId: string, subject: string, problem: string, limit?: number): Promise<AiChat[]> {
  let query = db()
    .from("ai_chats")
    .select("*")
    .eq("user_id", userId)
    .eq("subject", subject)
    .eq("problem", problem)
    .order("id", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  check(error, "AI 대화 조회 실패");
  return ((data ?? []) as ChatRow[]).map(fromRow).reverse();
}

export async function insertChat(row: {
  userId: string;
  subject: string;
  problem: string;
  at: number;
  question: string;
  answer: string;
  moments: Moment[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<AiChat> {
  const { data, error } = await db()
    .from("ai_chats")
    .insert({
      user_id: row.userId,
      feature: "helper",
      subject: row.subject,
      problem: row.problem,
      at_ms: Math.round(row.at),
      question: row.question,
      answer: row.answer,
      moments: row.moments,
      model: row.model,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
    })
    .select("*")
    .single<ChatRow>();
  check(error, "AI 대화 저장 실패");
  return fromRow(data!);
}

/** 부적절한 대화 표시. 학생은 자기 대화만 표시할 수 있고(지우지는 못함), 교사는 표시하거나 풀 수 있다 */
export async function setChatFlag(
  id: number,
  by: "student" | "teacher" | null,
  note: string | null,
  onlyUserId?: string,
): Promise<boolean> {
  let query = db()
    .from("ai_chats")
    .update({ flagged_by: by, flag_note: note, flagged_at: by ? new Date().toISOString() : null })
    .eq("id", id);
  if (onlyUserId) query = query.eq("user_id", onlyUserId);
  const { data, error } = await query.select("id");
  check(error, "AI 대화 표시 실패");
  return (data ?? []).length > 0;
}

/** 교사용: 기간 안의 모든 AI 대화 (최근 것부터). 표가 없으면 ready=false */
export async function listChatsSince(since: string): Promise<{ ready: boolean; chats: AiChat[] }> {
  try {
    const rows = await fetchAll<ChatRow>(
      () =>
        db()
          .from("ai_chats")
          .select("*")
          .gte("created_at", since)
          .order("id", { ascending: false }) as unknown as RangeQuery<ChatRow>,
    );
    return { ready: true, chats: rows.map(fromRow) };
  } catch (err) {
    if (aiTableMissing(err)) return { ready: false, chats: [] };
    throw err;
  }
}

/** 교사 처음 화면: 오늘·이번 달 질문 수와 사용량 */
export async function aiUsageSummary(): Promise<{ ready: boolean; today: Usage[]; month: Usage[] }> {
  const dayStart = kstDayStart();
  try {
    const rows = await fetchAll<Pick<ChatRow, "model" | "input_tokens" | "output_tokens" | "created_at" | "id">>(
      () =>
        db()
          .from("ai_chats")
          .select("id, model, input_tokens, output_tokens, created_at")
          .gte("created_at", kstMonthStart())
          .order("id") as unknown as RangeQuery<Pick<ChatRow, "model" | "input_tokens" | "output_tokens" | "created_at" | "id">>,
    );
    const usage = rows.map((r) => ({
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      today: new Date(r.created_at) >= new Date(dayStart),
    }));
    return { ready: true, today: usage.filter((u) => u.today), month: usage };
  } catch (err) {
    if (aiTableMissing(err)) return { ready: false, today: [], month: [] };
    throw err;
  }
}

/** 재생용: 이 학생이 이 문제에서 기록 시간(fromMs~toMs) 안에 물어본 대화. 표가 없으면 빈 목록 */
export async function listChatsForReplay(
  userId: string,
  subject: string,
  problem: string,
  fromMs: number,
  toMs: number,
): Promise<{ at: number; question: string; answer: string; moments: Moment[] }[]> {
  try {
    const { data, error } = await db()
      .from("ai_chats")
      .select("*")
      .eq("user_id", userId)
      .eq("subject", subject)
      .eq("problem", problem)
      .gte("at_ms", Math.floor(fromMs) - 5000)
      .lte("at_ms", Math.ceil(toMs) + 5000)
      .order("at_ms");
    check(error, "AI 대화 조회 실패");
    return ((data ?? []) as ChatRow[]).map(fromRow).map((c) => ({ at: c.at ?? 0, question: c.question, answer: c.answer, moments: c.moments }));
  } catch (err) {
    if (err instanceof AiChatsNotReadyError) return [];
    throw err;
  }
}

/** 재생 기록에 이어 붙일 AI 대화 (작성 기록의 처음~끝 시각 안). 학생 아이디를 모르면(v1 제출) 빈 목록 */
export async function chatsForReplay(owner: ReplayOwner, log: unknown): Promise<HelpChat[]> {
  const events = validEntries(log);
  // 도움 요청이 없는 기록이면 찾을 필요가 없다
  if (!owner.userId || !events.some((e) => e[1] === "q")) return [];
  const times = events.map((e) => e[0]);
  return listChatsForReplay(owner.userId, owner.subject, owner.problem, Math.min(...times), Math.max(...times));
}
