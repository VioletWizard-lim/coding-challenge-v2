import "server-only";
import bcrypt from "bcryptjs";
import { db, fetchAll, type UserRow } from "./db";

export type HealthStatus = { checkedAt: string | null; ok: boolean; ageHours: number | null };

/** /api/health(하루 1회 Vercel Cron)가 남긴 마지막 상태 확인 기록 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const { data, error } = await db().from("app_status").select("value, updated_at").eq("key", "health").maybeSingle();
  if (error) throw new Error(`상태 기록 조회 실패: ${error.message}`);
  if (!data) return { checkedAt: null, ok: false, ageHours: null };
  return {
    checkedAt: data.updated_at,
    ok: Boolean((data.value as { ok?: boolean } | null)?.ok),
    ageHours: (Date.now() - new Date(data.updated_at).getTime()) / 3_600_000,
  };
}

export type StudentRow = Pick<
  UserRow,
  "id" | "name" | "grade" | "class" | "programming_grade" | "programming_class" | "subjects"
>;

/** 학생 계정 전체 (비밀번호 칸은 가져오지 않는다) */
export function listStudents(): Promise<StudentRow[]> {
  return fetchAll<StudentRow>(() =>
    db()
      .from("users")
      .select("id, name, grade, class, programming_grade, programming_class, subjects")
      .eq("role", "student")
      .order("id"),
  );
}

/**
 * 학생 비밀번호를 새로 정한다. v2용 bcrypt 해시와 함께, v1 로그인이 되도록
 * 평문 password 칸에도 저장한다 (v1 운영이 끝나면 평문 저장은 뺀다).
 * 학생 계정만 바꿀 수 있다.
 */
export async function resetStudentPassword(id: string, password: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(password, 10);
  const { data, error } = await db()
    .from("users")
    .update({ password, password_hash: passwordHash })
    .eq("id", id)
    .eq("role", "student")
    .select("id");
  if (error) throw new Error(`비밀번호 저장 실패: ${error.message}`);
  return (data ?? []).length === 1;
}
