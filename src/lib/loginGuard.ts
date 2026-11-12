import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";

/**
 * 로그인 시도 횟수 제한: 같은 아이디로 5분 안에 5번까지만 비밀번호를 확인한다.
 * (교사가 만든 비밀번호는 숫자 6자리라, 제한이 없으면 자동으로 계속 넣어 볼 수 있다.)
 *
 * 새 표 없이 app_status(002)에 시도마다 한 줄을 남긴다: key "login_try:{임의 값}", value { id }, updated_at 시도 시각.
 * - 비밀번호를 확인하기 **전에** 한 줄을 넣고 센다. 동시에 여러 번 보내도 5번까지만 확인하게 된다.
 * - 로그인에 성공하거나 교사·관리자가 비밀번호를 새로 만들면 그 아이디의 줄을 지운다.
 * - 이 기록을 읽고 쓰다 오류가 나면(app_status가 없을 때 등) 막지 않고 그냥 로그인시킨다 (수업이 멈추면 안 된다).
 */
export const LOGIN_MAX_TRIES = 5;
export const LOGIN_WINDOW_MINUTES = 5;

const KEY_PATTERN = "login_try:%";

export class LoginLockedError extends Error {}

const mine = (id: string) => db().from("app_status").delete().like("key", KEY_PATTERN).eq("value->>id", id);

/** 비밀번호를 확인해도 되는지. 시도를 한 번 센다 (안 되면 false) */
export async function takeLoginTry(id: string): Promise<boolean> {
  try {
    const now = Date.now();
    const key = `login_try:${randomUUID()}`;
    const { error: insertError } = await db()
      .from("app_status")
      .insert({ key, value: { id }, updated_at: new Date(now).toISOString() });
    if (insertError) throw new Error(insertError.message);
    const { count, error } = await db()
      .from("app_status")
      .select("key", { count: "exact", head: true })
      .like("key", KEY_PATTERN)
      .eq("value->>id", id)
      .gte("updated_at", new Date(now - LOGIN_WINDOW_MINUTES * 60_000).toISOString());
    if (error) throw new Error(error.message);
    // 가끔 하루 지난 시도 기록을 치운다 (틀린 뒤 잠기지 않고 끝난 시도도 쌓이지 않게)
    if (Math.random() < 0.05) await clearOld(now);
    if ((count ?? 0) <= LOGIN_MAX_TRIES) return true;
    // 막힌 시도는 세지 않는다 (계속 눌러도 기다리는 시간이 늘어나지 않게)
    await db().from("app_status").delete().eq("key", key);
    return false;
  } catch (err) {
    console.warn("로그인 시도 기록 건너뜀:", (err as Error).message);
    return true;
  }
}

/** 하루 지난 시도 기록 지우기 */
async function clearOld(now: number) {
  await db()
    .from("app_status")
    .delete()
    .like("key", KEY_PATTERN)
    .lt("updated_at", new Date(now - 24 * 3_600_000).toISOString());
}

/** 이 아이디의 시도 기록을 지운다 (로그인 성공, 비밀번호 새로 만들기) */
export async function clearLoginTries(id: string): Promise<void> {
  try {
    const { error } = await mine(id);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.warn("로그인 시도 기록 지우기 건너뜀:", (err as Error).message);
  }
}
