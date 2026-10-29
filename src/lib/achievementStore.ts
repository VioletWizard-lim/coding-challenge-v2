import "server-only";
import { db } from "./db";

/** achievements_seen 칸이 없어서(007 실행 전) 생긴 오류인지 */
const columnMissing = (message: string) => /achievements_seen/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

/**
 * 이 학생에게 이미 알림을 띄운 업적들. 칸이 아직 없으면(007 실행 전) ready=false → 브라우저 기억으로 대신한다.
 * seen이 null이면 아직 한 번도 알림을 띄운 적이 없는 학생이다.
 */
export async function getAchievementsSeen(userId: string): Promise<{ ready: boolean; seen: string[] | null }> {
  const { data, error } = await db().from("users").select("achievements_seen").eq("id", userId).maybeSingle();
  if (error) {
    if (columnMissing(error.message)) return { ready: false, seen: null };
    throw new Error(`업적 알림 기록 조회 실패: ${error.message}`);
  }
  const seen = (data as { achievements_seen?: unknown } | null)?.achievements_seen;
  return { ready: true, seen: Array.isArray(seen) ? seen.filter((k): k is string => typeof k === "string") : null };
}

/** 알림을 띄운 업적 목록을 저장한다 (학생 계정만) */
export async function saveAchievementsSeen(userId: string, keys: string[]) {
  const { error } = await db().from("users").update({ achievements_seen: keys }).eq("id", userId).eq("role", "student");
  if (error && !columnMissing(error.message)) throw new Error(`업적 알림 기록 저장 실패: ${error.message}`);
}
