import "server-only";
import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { db, type UserRow } from "./db";
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
 * - password_hash 컬럼이 아직 없으면(마이그레이션 전) 평문으로만 확인하고 해시 저장은 건너뛴다.
 */
export async function verifyLogin(id: string, password: string): Promise<Session | null> {
  const { data, error } = await db().from("users").select("*").eq("id", id).maybeSingle<UserRow>();
  if (error) throw new Error(`사용자 조회 실패: ${error.message}`);
  if (!data) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  const hashOk = data.password_hash ? await bcrypt.compare(password, data.password_hash) : false;
  const plainOk = !hashOk && typeof data.password === "string" && sameText(password, data.password);
  if (!hashOk && !plainOk) return null;

  if (plainOk && "password_hash" in data) {
    const hash = await bcrypt.hash(password, 10);
    const { error: updateError } = await db().from("users").update({ password_hash: hash }).eq("id", data.id);
    if (updateError) console.warn("password_hash 저장 실패:", updateError.message);
  }

  return { id: String(data.id), role: data.role === "teacher" ? "teacher" : "student", name: data.name ?? "" };
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
