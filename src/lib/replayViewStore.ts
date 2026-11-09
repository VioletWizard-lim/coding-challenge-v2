import "server-only";
import { db, fetchAll, type RangeQuery } from "./db";

const tableMissing = (message: string) => /replay_views/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

/** 내 재생을 끝까지 본 기록을 남긴다 (처음 본 때만 남고, 다시 봐도 그대로). 표가 없으면(018 실행 전) 조용히 넘어간다 */
export async function markReplayWatched(userId: string, submissionId: number): Promise<boolean> {
  const { error } = await db()
    .from("replay_views")
    .upsert({ user_id: userId, submission_id: submissionId }, { onConflict: "user_id,submission_id", ignoreDuplicates: true });
  if (error && tableMissing(error.message)) return false;
  if (error) throw new Error(`재생 기록 저장 실패: ${error.message}`);
  return true;
}

/** 업적용: 이 학생이 끝까지 본 재생들. 표가 없으면 빈 목록 */
export async function listWatched(userId: string): Promise<{ submissionId: number; watchedAt: string }[]> {
  try {
    const rows = await fetchAll<{ submission_id: number; watched_at: string }>(
      () =>
        db()
          .from("replay_views")
          .select("submission_id, watched_at")
          .eq("user_id", userId)
          .order("submission_id") as unknown as RangeQuery<{ submission_id: number; watched_at: string }>,
    );
    return rows.map((r) => ({ submissionId: Number(r.submission_id), watchedAt: r.watched_at }));
  } catch (err) {
    if (tableMissing(String((err as Error)?.message ?? err))) return [];
    throw err;
  }
}
