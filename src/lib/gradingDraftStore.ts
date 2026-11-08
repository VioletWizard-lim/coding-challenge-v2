import "server-only";
import type { Usage } from "./aiChat";
import { db, fetchAll, type RangeQuery } from "./db";
import type { DraftPart, GradingDraft } from "./gradingDraft";
import type { SubmissionRow } from "./db";

type DraftRow = {
  id: number;
  submission_id: number;
  parts: DraftPart[];
  feedback: string;
  note: string;
  created_at: string;
};

const fromRow = (r: DraftRow): GradingDraft => ({
  id: Number(r.id),
  submissionId: Number(r.submission_id),
  parts: Array.isArray(r.parts) ? r.parts : [],
  feedback: r.feedback ?? "",
  note: r.note ?? "",
  createdAt: r.created_at,
});

const tableMissing = (message: string) => /grading_drafts/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

export class DraftsNotReadyError extends Error {}

/** 이 제출의 가장 최근 초안 (없으면 null). 표가 없으면 ready=false */
export async function latestDraft(submissionId: number): Promise<{ ready: boolean; draft: GradingDraft | null }> {
  const { data, error } = await db()
    .from("grading_drafts")
    .select("*")
    .eq("submission_id", submissionId)
    .order("id", { ascending: false })
    .limit(1);
  if (error) {
    if (tableMissing(error.message)) return { ready: false, draft: null };
    throw new Error(`채점 초안 조회 실패: ${error.message}`);
  }
  const rows = (data ?? []) as DraftRow[];
  return { ready: true, draft: rows.length ? fromRow(rows[0]) : null };
}

export async function insertDraft(row: {
  submissionId: number;
  teacherId: string;
  parts: DraftPart[];
  feedback: string;
  note: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<GradingDraft> {
  const { data, error } = await db()
    .from("grading_drafts")
    .insert({
      submission_id: row.submissionId,
      teacher_id: row.teacherId,
      parts: row.parts,
      feedback: row.feedback,
      note: row.note,
      model: row.model,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
    })
    .select("*")
    .single<DraftRow>();
  if (error) {
    if (tableMissing(error.message)) throw new DraftsNotReadyError(error.message);
    throw new Error(`채점 초안 저장 실패: ${error.message}`);
  }
  return fromRow(data);
}

/** 채점 초안에 필요한 제출 내용 (코드·설명·작성 기록) */
export async function submissionForDraft(id: number) {
  const { data, error } = await db()
    .from("submissions")
    .select("id, subject, problem, code, description, init_code, edit_log")
    .eq("id", id)
    .maybeSingle<Pick<SubmissionRow, "id" | "subject" | "problem" | "code" | "description" | "init_code" | "edit_log">>();
  if (error) throw new Error(`제출 조회 실패: ${error.message}`);
  return data;
}

/** 사용량 카드용: 기간 안의 채점 초안 토큰 */
export async function draftUsageSince(since: string): Promise<(Usage & { createdAt: string; teacherId: string | null })[]> {
  type Row = { id: number; teacher_id: string | null; model: string | null; input_tokens: number | null; output_tokens: number | null; created_at: string };
  try {
    const rows = await fetchAll<Row>(
      () =>
        db()
          .from("grading_drafts")
          .select("id, teacher_id, model, input_tokens, output_tokens, created_at")
          .gte("created_at", since)
          .order("id") as unknown as RangeQuery<Row>,
    );
    return rows.map((r) => ({
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      createdAt: r.created_at,
      teacherId: r.teacher_id,
    }));
  } catch (err) {
    if (tableMissing(String((err as Error).message))) return [];
    throw err;
  }
}
