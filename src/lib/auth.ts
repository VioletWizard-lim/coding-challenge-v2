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
 * - v1 운영은 끝났다(2026-11). 평문 password 칸이 아직 남은 계정(022 SQL 실행 전, v1에서 바꾼 비밀번호)은
 *   평문으로 확인하고, 맞으면 새 해시를 저장하고 평문을 지운다.
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
    // 해시를 만들면 평문 비밀번호는 지운다 (v1 운영이 끝나 평문을 쓰는 곳이 없음)
    const values = { password_hash: hash, password: null };
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
 * 내 비밀번호를 새로 정한다. 해시만 저장하고 평문 칸은 비운다.
 * 새 해시를 돌려준다 (세션 쿠키의 비밀번호 지문용)
 */
export async function setOwnPassword(id: string, next: string): Promise<string> {
  const hash = await bcrypt.hash(next, 10);
  const values = { password_hash: hash, password: null };
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
