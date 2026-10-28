"use server";

import { randomInt } from "node:crypto";
import { getSession } from "@/lib/session";
import { resetStudentPassword } from "@/lib/teacher";

export type ResetResult = { ok: true; password: string } | { ok: false; message: string };

/** 임의의 숫자 6자리 (000000~999999) */
const newPassword = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** 교사가 학생 비밀번호를 임의의 숫자 6자리로 새로 만든다. 만든 비밀번호는 이때 한 번만 보여 준다. */
export async function resetPassword(studentId: string): Promise<ResetResult> {
  const session = await getSession();
  if (!session || session.role !== "teacher") return { ok: false, message: "교사 계정으로 다시 로그인하세요." };

  const id = String(studentId ?? "").trim();
  if (!id) return { ok: false, message: "학생을 고르세요." };

  const password = newPassword();
  try {
    const changed = await resetStudentPassword(id, password);
    if (!changed) return { ok: false, message: "그 학번의 학생 계정을 찾지 못했어요." };
  } catch (err) {
    console.error("비밀번호 초기화 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
  return { ok: true, password };
}
