import "server-only";
import { kstDayStart, type Usage } from "./aiChat";
import type { AiReview, ReviewQuestion } from "./aiReview";
import { db, fetchAll, type RangeQuery } from "./db";

type ReviewRow = {
  id: number;
  user_id: string;
  submission_id: number;
  subject: string;
  problem: string;
  intro: string;
  questions: unknown;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  flagged_by: string | null;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: ReviewRow): AiReview => ({
  id: Number(r.id),
  userId: r.user_id,
  submissionId: Number(r.submission_id),
  subject: r.subject,
  problem: r.problem,
  intro: r.intro,
  questions: Array.isArray(r.questions)
    ? (r.questions as ReviewQuestion[]).map((q) => ({
        moment: q?.moment && typeof q.moment.at === "number" ? q.moment : null,
        question: String(q?.question ?? ""),
        answer: String(q?.answer ?? ""),
      }))
    : [],
  flaggedBy: r.flagged_by === "student" || r.flagged_by === "teacher" ? r.flagged_by : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  model: r.model,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
});

/** ai_reviews 표가 없어서(011 실행 전) 생긴 오류인지 */
const tableMissing = (message: string) => /ai_reviews/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

export class AiReviewsNotReadyError extends Error {}

function check(error: { message: string } | null, what: string) {
  if (!error) return;
  if (tableMissing(error.message)) throw new AiReviewsNotReadyError(error.message);
  throw new Error(`${what}: ${error.message}`);
}

/** 제출 하나의 되돌아보기 (없으면 null). 표가 없으면 ready=false */
export async function getReview(submissionId: number): Promise<{ ready: boolean; review: AiReview | null }> {
  const { data, error } = await db().from("ai_reviews").select("*").eq("submission_id", submissionId).maybeSingle<ReviewRow>();
  if (error && tableMissing(error.message)) return { ready: false, review: null };
  check(error, "되돌아보기 조회 실패");
  return { ready: true, review: data ? fromRow(data) : null };
}

/** 오늘(한국 시간) 이 학생이 만든 되돌아보기 수 (AI 하루 한도에 함께 센다). 표가 없으면 0 */
export async function countTodayReviews(userId: string): Promise<number> {
  const { count, error } = await db()
    .from("ai_reviews")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", kstDayStart());
  if (error && tableMissing(error.message)) return 0;
  check(error, "되돌아보기 수 조회 실패");
  return count ?? 0;
}

export async function insertReview(row: {
  userId: string;
  submissionId: number;
  subject: string;
  problem: string;
  intro: string;
  questions: ReviewQuestion[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<AiReview> {
  const { data, error } = await db()
    .from("ai_reviews")
    .insert({
      user_id: row.userId,
      submission_id: row.submissionId,
      subject: row.subject,
      problem: row.problem,
      intro: row.intro,
      questions: row.questions,
      model: row.model,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
    })
    .select("*")
    .single<ReviewRow>();
  check(error, "되돌아보기 저장 실패");
  return fromRow(data!);
}

/** 학생 답 저장 (자기 것만) */
export async function saveReviewQuestions(id: number, userId: string, questions: ReviewQuestion[]): Promise<AiReview | null> {
  const { data, error } = await db()
    .from("ai_reviews")
    .update({ questions, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*");
  check(error, "되돌아보기 답 저장 실패");
  const rows = (data ?? []) as ReviewRow[];
  return rows.length ? fromRow(rows[0]) : null;
}

/** 부적절한 내용 표시. 학생은 자기 것만 표시할 수 있고, 교사는 표시하거나 풀 수 있다 */
export async function setReviewFlag(id: number, by: "student" | "teacher" | null, onlyUserId?: string): Promise<boolean> {
  let query = db()
    .from("ai_reviews")
    .update({ flagged_by: by, flag_note: by ? `${by === "student" ? "학생" : "교사"}이 표시함` : null, flagged_at: by ? new Date().toISOString() : null })
    .eq("id", id);
  if (onlyUserId) query = query.eq("user_id", onlyUserId);
  const { data, error } = await query.select("id");
  check(error, "되돌아보기 표시 실패");
  return (data ?? []).length > 0;
}

/** 교사용: 기간 안의 되돌아보기 (최근 것부터). 표가 없으면 ready=false */
export async function listReviewsSince(since: string): Promise<{ ready: boolean; reviews: AiReview[] }> {
  try {
    const rows = await fetchAll<ReviewRow>(
      () => db().from("ai_reviews").select("*").gte("created_at", since).order("id", { ascending: false }) as unknown as RangeQuery<ReviewRow>,
    );
    return { ready: true, reviews: rows.map(fromRow) };
  } catch (err) {
    if (tableMissing(String((err as Error).message))) return { ready: false, reviews: [] };
    throw err;
  }
}

/** 사용량 카드용: 기간 안의 되돌아보기 토큰 */
export async function reviewUsageSince(since: string): Promise<(Usage & { createdAt: string })[]> {
  try {
    const rows = await fetchAll<Pick<ReviewRow, "id" | "model" | "input_tokens" | "output_tokens" | "created_at">>(
      () =>
        db()
          .from("ai_reviews")
          .select("id, model, input_tokens, output_tokens, created_at")
          .gte("created_at", since)
          .order("id") as unknown as RangeQuery<Pick<ReviewRow, "id" | "model" | "input_tokens" | "output_tokens" | "created_at">>,
    );
    return rows.map((r) => ({ model: r.model, inputTokens: r.input_tokens, outputTokens: r.output_tokens, createdAt: r.created_at }));
  } catch (err) {
    if (tableMissing(String((err as Error).message))) return [];
    throw err;
  }
}
