import "server-only";
import { db, fetchAll, type RangeQuery } from "./db";
import { deleteSummary } from "./submissionSummaryStore";
import { DEFAULT_RUBRIC, parseRubric, sameRubric, sheetOf, v1Columns, type GradingRow, type RubricPart, type ScorePart } from "./grading";
import { loadSheets, tablesMissing } from "./scoreSheetStore";
import { hasUserIdColumn } from "./submissions";

type Row = {
  id: number;
  submitted_at: string;
  user_id?: string | null;
  name: string;
  grade: number | string | null;
  class: number | string | null;
  subject: string;
  problem: string;
  code: string | null;
  description: string | null;
  score_function: number | null;
  score_understanding: number | null;
  score_challenge: number | null;
  score_total: number | null;
  feedback: string | null;
  wrong_reason: string | null;
};

const text = (v: unknown) => (v === null || v === undefined ? null : String(v));

const fromRow = (r: Row, saved?: unknown): GradingRow => ({
  id: Number(r.id),
  submittedAt: r.submitted_at,
  userId: r.user_id ?? null,
  name: r.name,
  grade: text(r.grade),
  cls: text(r.class),
  subject: r.subject,
  problem: r.problem,
  code: r.code ?? "",
  description: r.description ?? "",
  sheet: sheetOf(saved, { fn: r.score_function, und: r.score_understanding, ch: r.score_challenge, total: r.score_total }),
  total: r.score_total,
  feedback: r.feedback ?? "",
  wrongReason: r.wrong_reason ?? "",
});

/* ── 채점 기준·채점표 (012). 표가 없으면 기본 기준(40/40/20)과 v1 칸만으로 동작한다 ── */


export class RubricsNotReadyError extends Error {}

/** 과목의 채점 기준 (없으면 기본). ready=false면 012 실행 전 */
export async function getRubric(subject: string): Promise<{ ready: boolean; parts: RubricPart[] }> {
  const { data, error } = await db().from("grading_rubrics").select("parts").eq("subject", subject).maybeSingle<{ parts: unknown }>();
  if (error) {
    if (tablesMissing(error.message)) return { ready: false, parts: DEFAULT_RUBRIC };
    throw new Error(`채점 기준 조회 실패: ${error.message}`);
  }
  return { ready: true, parts: data ? parseRubric(data.parts) : DEFAULT_RUBRIC };
}

export async function saveRubric(subject: string, parts: RubricPart[]): Promise<void> {
  const { error } = await db()
    .from("grading_rubrics")
    .upsert({ subject, parts, updated_at: new Date().toISOString() }, { onConflict: "subject" });
  if (error) {
    if (tablesMissing(error.message)) throw new RubricsNotReadyError(error.message);
    throw new Error(`채점 기준 저장 실패: ${error.message}`);
  }
}


export type GradingFilter = {
  subject: string;
  /** "2-3" (제출할 때의 학년-반). 빈 값이면 전체 */
  cls: string;
  problem: string;
  /** 이름(또는 아이디) 찾기 */
  query: string;
  ungradedOnly: boolean;
};

type Query = {
  eq(c: string, v: string): Query;
  or(f: string): Query;
  ilike(c: string, v: string): Query;
  order(c: string, o: { ascending: boolean }): Query;
  range(a: number, b: number): PromiseLike<{ data: Row[] | null; error: { message: string } | null; count: number | null }>;
};

/** 미채점 = 합계가 없거나 0이고, 오답 처리도 안 됨 (v1 "미채점만 보기"와 같은 기준) */
export function onlyUngraded<Q extends { or(f: string): Q }>(q: Q): Q {
  return q.or("score_total.is.null,score_total.eq.0").or('wrong_reason.is.null,wrong_reason.eq.""');
}

/** 채점 목록 한 쪽 (최근 제출부터). total은 조건에 맞는 전체 수 */
export async function listForGrading(f: GradingFilter, page: number, pageSize: number): Promise<{ rows: GradingRow[]; total: number }> {
  const withUserId = await hasUserIdColumn();
  const columns = [
    "id, submitted_at, name, grade, class, subject, problem, code, description",
    "score_function, score_understanding, score_challenge, score_total, feedback, wrong_reason",
    ...(withUserId ? ["user_id"] : []),
  ].join(", ");
  let q = db().from("submissions").select(columns, { count: "exact" }).eq("subject", f.subject) as unknown as Query;
  if (f.problem) q = q.eq("problem", f.problem);
  if (f.cls) {
    const [g, c] = f.cls.split("-");
    q = q.eq("grade", g).eq("class", c);
  }
  const query = f.query.trim().replace(/[%_,()"\\]/g, "");
  if (query) q = withUserId ? q.or(`name.ilike.%${query}%,user_id.ilike.%${query}%`) : q.ilike("name", `%${query}%`);
  if (f.ungradedOnly) q = onlyUngraded(q);
  const from = Math.max(0, page - 1) * pageSize;
  const { data, error, count } = await q
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`채점 목록 조회 실패: ${error.message}`);
  const rows = data ?? [];
  const sheets = await loadSheets(rows.map((r) => Number(r.id)));
  return { rows: rows.map((r) => fromRow(r, sheets.get(Number(r.id)))), total: count ?? 0 };
}

/** 이 과목에 제출이 있는 반들 (제출할 때의 학년-반) */
export async function classesWithSubmissions(subject: string): Promise<string[]> {
  const rows = await fetchAll<{ id: number; grade: number | string | null; class: number | string | null }>(
    () =>
      db().from("submissions").select("id, grade, class").eq("subject", subject).order("id") as unknown as RangeQuery<{
        id: number;
        grade: number | string | null;
        class: number | string | null;
      }>,
  );
  const set = new Set(rows.filter((r) => r.grade && r.class).map((r) => `${r.grade}-${r.class}`));
  return [...set].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
}

async function update(id: number, values: Record<string, unknown>, what: string): Promise<GradingRow | null> {
  const { data, error } = await db().from("submissions").update(values).eq("id", id).select("*");
  if (error) throw new Error(`${what}: ${error.message}`);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return null;
  const sheets = await loadSheets([id]);
  return fromRow(rows[0], sheets.get(id));
}

/**
 * 점수·감점 이유 저장: 채점표(기준 사본 + 점수)를 submission_scores에, 합계·감점 이유를 v1 칸에.
 * 012 실행 전이면 기본 기준(40/40/20)일 때만 v1 칸으로 저장할 수 있다.
 */
export async function saveScores(id: number, sheet: ScorePart[], total: number, feedback: string, teacherId: string) {
  const { error } = await db()
    .from("submission_scores")
    .upsert({ submission_id: id, parts: sheet, graded_by: teacherId, updated_at: new Date().toISOString() }, { onConflict: "submission_id" });
  if (error) {
    if (!tablesMissing(error.message)) throw new Error(`채점표 저장 실패: ${error.message}`);
    if (!sameRubric(sheet, DEFAULT_RUBRIC)) throw new RubricsNotReadyError(error.message);
  }
  return update(id, { ...v1Columns(sheet), score_total: total, feedback }, "채점 저장 실패");
}

export const setWrongReason = (id: number, reason: string | null) => update(id, { wrong_reason: reason }, "오답 처리 실패");

export async function getScoreTotal(id: number): Promise<number | null | undefined> {
  const { data, error } = await db().from("submissions").select("score_total").eq("id", id).maybeSingle<{ score_total: number | null }>();
  if (error) throw new Error(`제출 조회 실패: ${error.message}`);
  return data ? data.score_total : undefined;
}

export async function deleteSubmission(id: number): Promise<boolean> {
  const { data, error } = await db().from("submissions").delete().eq("id", id).select("id");
  if (error) throw new Error(`제출 삭제 실패: ${error.message}`);
  await deleteSummary(id);
  return (data ?? []).length > 0;
}

/** 과목별 채점 대기 수 (점수도 오답 처리도 안 된 제출, v1 "미채점"과 같은 기준). 처음 화면·채점 화면 공용 */
export async function pendingBySubject(): Promise<Record<string, number>> {
  const rows = await fetchAll<{ id: number; subject: string }>(
    () => onlyUngraded(db().from("submissions").select("id, subject")).order("id") as unknown as RangeQuery<{ id: number; subject: string }>,
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.subject || "(과목 없음)"] = (counts[r.subject || "(과목 없음)"] ?? 0) + 1;
  return counts;
}
