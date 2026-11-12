import "server-only";
import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { db, type UserRow } from "./db";
import { clearLoginTries, LoginLockedError, takeLoginTry } from "./loginGuard";
import type { Session } from "./session";

// 없는 아이디일 때도 비교 시간을 비슷하게 맞추기 위한 해시
const DUMMY_HASH = "$2b$10$FLVaOrh/yfTp9i6BARhyreLSCVY61D4xAOBmhmlXDroX.LJTEQEri";

const sameText = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/**
 * 학번(아이디)·비밀번호를 확인한다. 맞으면 세션 정보를, 틀리면 null을 돌려준다.
 *
 * - password_hash(bcrypt)가 있으면 그것으로 확인한다.
 * - v1이 운영 중이라 평문 password 컬럼도 남아 있다. 해시가 없거나, v1에서 비밀번호를 바꿔
 *   해시와 달라졌으면 평문으로 확인하고, 맞으면 새 해시를 저장한다.
 * - 같은 아이디로 5분 안에 5번 넘게 시도하면 LoginLockedError를 던진다 (loginGuard.ts).
 * - password_hash 컬럼이 아직 없으면(마이그레이션 전) 평문으로만 확인하고 해시 저장은 건너뛴다.
 */
export async function verifyLogin(id: string, password: string): Promise<(Session & { credential: string | null }) | null> {
  const { data, error } = await db().from("users").select("*").eq("id", id).maybeSingle<UserRow>();
  if (error) throw new Error(`사용자 조회 실패: ${error.message}`);
  if (!data) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  // 같은 아이디로 짧은 시간에 너무 여러 번 시도하면 잠시 막는다 (있는 계정만 센다)
  if (!(await takeLoginTry(String(data.id)))) throw new LoginLockedError("로그인 시도가 너무 많아요.");

  const hashOk = data.password_hash ? await bcrypt.compare(password, data.password_hash) : false;
  const plainOk = !hashOk && typeof data.password === "string" && sameText(password, data.password);
  if (!hashOk && !plainOk) return null;

  let credential: string | null = data.password_hash ?? data.password ?? null;
  if (plainOk && "password_hash" in data) {
    const hash = await bcrypt.hash(password, 10);
    // 관리자 계정은 v1을 쓰지 않으므로, 해시를 만들면 평문 비밀번호를 지운다
    const values = data.role === "admin" ? { password_hash: hash, password: null } : { password_hash: hash };
    const { error: updateError } = await db().from("users").update(values).eq("id", data.id);
    if (updateError) console.warn("password_hash 저장 실패:", updateError.message);
    else credential = hash;
  }

  await clearLoginTries(String(data.id));
  const role = data.role === "admin" ? "admin" : data.role === "teacher" ? "teacher" : "student";
  return { id: String(data.id), role, name: data.name ?? "", credential };
}

export const MIN_PASSWORD = 6;
export const MAX_PASSWORD = 64;

/** 새 비밀번호 확인 (직접 바꾸기). 문제가 있으면 이유를, 없으면 null */
export function checkNewPassword(id: string, current: string, next: string, again: string): string | null {
  if (next.length < MIN_PASSWORD) return `새 비밀번호는 ${MIN_PASSWORD}자 이상으로 정해 주세요.`;
  if (next.length > MAX_PASSWORD) return `새 비밀번호는 ${MAX_PASSWORD}자까지 쓸 수 있어요.`;
  if (next !== again) return "새 비밀번호 두 칸이 서로 달라요.";
  if (next === current) return "지금 비밀번호와 다른 것으로 정해 주세요.";
  if (next === id) return "아이디(학번)와 같은 비밀번호는 쓸 수 없어요.";
  if (/^\s|\s$/.test(next)) return "비밀번호 앞뒤에 띄어쓰기를 넣지 말아 주세요.";
  return null;
}

/**
 * 내 비밀번호를 새로 정한다. 해시를 저장하고, v1이 운영 중이라 학생·교사는 평문 칸에도 함께 저장한다(v1 로그인용).
 * 관리자는 v1을 쓰지 않으므로 평문을 지운다. 새 해시를 돌려준다 (세션 쿠키의 비밀번호 지문용)
 */
export async function setOwnPassword(id: string, role: Session["role"], next: string): Promise<string> {
  const hash = await bcrypt.hash(next, 10);
  const values = role === "admin" ? { password_hash: hash, password: null } : { password_hash: hash, password: next };
  const { data, error } = await db().from("users").update(values).eq("id", id).select("id");
  if (error) throw new Error(`비밀번호 저장 실패: ${error.message}`);
  if ((data ?? []).length !== 1) throw new Error("계정을 찾지 못했어요.");
  return hash;
}

/** 로그인한 사용자의 최신 정보(과목·반 등)를 DB에서 읽는다. 비밀번호 컬럼은 돌려주지 않는다. */
export async function getUserProfile(id: string) {
  const { data, error } = await db()
    .from("users")
    .select("id, role, name, grade, class, programming_grade, programming_class, subjects")
    .eq("id", id)
    .maybeSingle<Omit<UserRow, "password" | "password_hash">>();
  if (error) throw new Error(`사용자 조회 실패: ${error.message}`);
  return data;
}
