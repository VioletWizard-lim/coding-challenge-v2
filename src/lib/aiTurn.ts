import "server-only";
import { db } from "./db";

/**
 * 한 학생의 AI 요청을 한 번에 하나씩만 처리한다 (하루 한도를 "세고 → AI 부르고 → 저장"하는 사이에
 * 다른 창에서 동시에 보낸 요청이 끼어들어 한도를 넘지 않게).
 *
 * 새 표 없이 app_status(002)에 "ai_busy:{종류}:{아이디}" 한 줄을 잠깐 넣었다가 끝나면 지운다(같은 key는 한 줄만 들어감).
 * 서버가 도중에 멈춰 줄이 남아도 STALE_MS가 지나면 무시한다. 이 기록을 쓰지 못하면(app_status가 없는 등) 막지 않는다.
 */
const STALE_MS = 5 * 60_000;

export const AI_BUSY_MESSAGE = "앞에서 보낸 AI 요청이 아직 끝나지 않았어요. 답이 온 뒤에 다시 해 주세요.";

const keyOf = (kind: string, userId: string) => `ai_busy:${kind}:${userId}`;

async function take(key: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await db().from("app_status").insert({ key, value: {}, updated_at: new Date().toISOString() });
    if (!error) return true;
    if (error.code !== "23505") throw new Error(error.message); // 23505: 이미 있음
    // 이미 있으면: 오래된 줄(서버가 도중에 멈춤)이면 지우고 한 번 더
    const { data } = await db().from("app_status").select("updated_at").eq("key", key).maybeSingle();
    if (data && Date.now() - new Date(data.updated_at).getTime() < STALE_MS) return false;
    await db().from("app_status").delete().eq("key", key).lt("updated_at", new Date(Date.now() - STALE_MS).toISOString());
  }
  return false;
}

/** 이 학생의 같은 종류 AI 요청이 처리 중이면 busy를 돌려주고, 아니면 fn을 돌린다 */
export async function oneAtATime<T>(kind: string, userId: string, busy: T, fn: () => Promise<T>): Promise<T> {
  const key = keyOf(kind, userId);
  let held = false;
  try {
    held = await take(key);
    if (!held) return busy;
  } catch (err) {
    console.warn("AI 요청 순서 기록 건너뜀:", (err as Error).message);
    return fn();
  }
  try {
    return await fn();
  } finally {
    const { error } = await db().from("app_status").delete().eq("key", key);
    if (error) console.warn("AI 요청 순서 기록 지우기 실패:", error.message);
  }
}
