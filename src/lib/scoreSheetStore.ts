import "server-only";
import { db } from "./db";
import { parseSheet, type ScorePart } from "./grading";

/** 012(grading_rubrics·submission_scores) 실행 전이라 생긴 오류인지 */
export const tablesMissing = (message: string) =>
  /(grading_rubrics|submission_scores)/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

/** 제출들의 채점표 (제출 id → 채점표). 표가 없으면 빈 Map */
export async function loadSheets(ids: number[]): Promise<Map<number, ScorePart[]>> {
  const map = new Map<number, ScorePart[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await db().from("submission_scores").select("submission_id, parts").in("submission_id", chunk);
    if (error) {
      if (tablesMissing(error.message)) return map;
      throw new Error(`채점표 조회 실패: ${error.message}`);
    }
    for (const r of (data ?? []) as { submission_id: number; parts: unknown }[]) {
      const sheet = parseSheet(r.parts);
      if (sheet) map.set(Number(r.submission_id), sheet);
    }
  }
  return map;
}
