import "server-only";
import { db, type SubmissionRow } from "./db";
import { isSummaryData, summaryDataOf, SUMMARY_VERSION, type SummaryData } from "./submissionSummary";

const tableMissing = (message: string) => /submission_summaries/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

const CHUNK = 200;

/**
 * 저장해 둔 요약을 읽는다 (지금 판 번호의 것만). 없는 제출은 결과에 없다.
 * 표가 없으면(021 실행 전) ready=false: 부르는 쪽이 전처럼 기록에서 계산한다.
 */
export async function loadSummaries(ids: number[]): Promise<{ ready: boolean; found: Map<number, SummaryData> }> {
  const found = new Map<number, SummaryData>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db()
      .from("submission_summaries")
      .select("submission_id, data")
      .eq("version", SUMMARY_VERSION)
      .in("submission_id", ids.slice(i, i + CHUNK));
    if (error && tableMissing(error.message)) return { ready: false, found: new Map() };
    if (error) throw new Error(`요약 조회 실패: ${error.message}`);
    for (const row of data ?? []) if (isSummaryData(row.data)) found.set(Number(row.submission_id), row.data);
  }
  return { ready: true, found };
}

/** 새로 계산한 요약을 저장한다. 저장에 실패해도 화면은 그대로 보여 준다 (다음에 다시 계산) */
export async function saveSummaries(items: { id: number; data: SummaryData }[]): Promise<void> {
  for (let i = 0; i < items.length; i += CHUNK) {
    const { error } = await db()
      .from("submission_summaries")
      .upsert(
        items.slice(i, i + CHUNK).map((x) => ({ submission_id: x.id, version: SUMMARY_VERSION, data: x.data })),
        { onConflict: "submission_id" },
      );
    if (error) return console.warn("요약 저장 건너뜀:", error.message);
  }
}

/** 제출을 지울 때 그 요약도 지운다 (실패해도 넘어간다) */
export async function deleteSummary(id: number): Promise<void> {
  const { error } = await db().from("submission_summaries").delete().eq("submission_id", id);
  if (error && !tableMissing(error.message)) console.warn("요약 삭제 건너뜀:", error.message);
}

/** 요약을 새로 계산할 때만 읽는 무거운 칸 */
export type HeavyRow = Pick<SubmissionRow, "id" | "init_code" | "edit_log" | "code">;

const HEAVY_CHUNK = 50;

/** 이 제출들의 작성 기록·코드를 읽는다 (무거우므로 꼭 필요한 제출만, 50건씩) */
export async function loadHeavy(ids: number[]): Promise<Map<number, HeavyRow>> {
  const found = new Map<number, HeavyRow>();
  for (let i = 0; i < ids.length; i += HEAVY_CHUNK) {
    const { data, error } = await db()
      .from("submissions")
      .select("id, init_code, edit_log, code")
      .in("id", ids.slice(i, i + HEAVY_CHUNK))
      .returns<HeavyRow[]>();
    if (error) throw new Error(`기록 조회 실패: ${error.message}`);
    for (const row of data ?? []) found.set(Number(row.id), row);
  }
  return found;
}

/** 그 사이 지워진 제출처럼 기록을 읽지 못한 것 */
export const EMPTY_SUMMARY = summaryDataOf(null, null, null);

/**
 * 이 제출들의 요약 (학생 화면·교사 통계 공용). 저장해 둔 것을 읽고, 없는 것만 작성 기록을 읽어 계산해 저장한다.
 * 021 실행 전이면 모두 기록에서 계산한다(저장은 건너뜀). 기록을 읽지 못한 제출은 결과에 없다.
 */
export async function summariesFor(ids: number[]): Promise<Map<number, SummaryData>> {
  const { ready, found } = await loadSummaries(ids);
  const missing = ids.filter((x) => !found.has(x));
  if (!missing.length) return found;
  const heavy = await loadHeavy(missing);
  const fresh = missing.flatMap((x) => {
    const h = heavy.get(x);
    return h ? [{ id: x, data: summaryDataOf(h.init_code, h.edit_log, h.code) }] : [];
  });
  for (const x of fresh) found.set(x.id, x.data);
  if (ready) await saveSummaries(fresh);
  return found;
}
