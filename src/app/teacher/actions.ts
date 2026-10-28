"use server";

import { getSession } from "@/lib/session";
import { resetStudentPassword } from "@/lib/teacher";

export type ResetResult = { ok: true; message: string } | { ok: false; message: string };

const MIN_LENGTH = 4;
const MAX_LENGTH = 72; // bcrypt가 다루는 최대 길이

/** 교사가 학생 비밀번호를 새로 정한다. */
export async function resetPassword(studentId: string, password: string): Promise<ResetResult> {
  const session = await getSession();
  if (!session || session.role !== "teacher") return { ok: false, message: "교사 계정으로 다시 로그인하세요." };

  const id = String(studentId ?? "").trim();
  const pw = String(password ?? "");
  if (!id) return { ok: false, message: "학생을 고르세요." };
  if (pw.trim() !== pw || pw.length < MIN_LENGTH || pw.length > MAX_LENGTH) {
    return { ok: false, message: `비밀번호는 앞뒤 공백 없이 ${MIN_LENGTH}~${MAX_LENGTH}자로 입력하세요.` };
  }

  try {
    const changed = await resetStudentPassword(id, pw);
    if (!changed) return { ok: false, message: "그 학번의 학생 계정을 찾지 못했어요." };
  } catch (err) {
    console.error("비밀번호 초기화 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
  return { ok: true, message: `${id} 학생의 비밀번호를 바꿨어요. v1과 v2 모두 새 비밀번호로 로그인돼요.` };
}
