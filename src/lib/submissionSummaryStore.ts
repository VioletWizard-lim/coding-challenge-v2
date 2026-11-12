import "server-only";
import { db } from "./db";
import { isSummaryData, SUMMARY_VERSION, type SummaryData } from "./submissionSummary";

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
