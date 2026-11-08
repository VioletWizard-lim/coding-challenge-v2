"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { getSession } from "@/lib/session";
import { createTeacher, resetTeacherPassword } from "@/lib/teacher";

/** 관리자만 쓸 수 있다 (모든 관리자 액션에서 다시 확인) */
const isAdmin = async () => (await getSession())?.role === "admin";

/** 헷갈리기 쉬운 글자(0·O, 1·l·I)를 뺀 8자리 임시 비밀번호 */
function tempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => chars[randomInt(0, chars.length)]).join("");
}

const ID_PATTERN = /^[A-Za-z0-9_.-]{3,30}$/;

export type AccountResult = { ok: true; id: string; password: string } | { ok: false; message: string };

/** 교사 계정 만들기: 임시 비밀번호를 만들어 이때 한 번만 보여 준다 */
export async function addTeacher(id: string, name: string): Promise<AccountResult> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  const teacherId = String(id ?? "").trim();
  const teacherName = String(name ?? "").trim();
  if (!ID_PATTERN.test(teacherId)) return { ok: false, message: "아이디는 영문·숫자·_ . - 로 3~30자로 적어 주세요." };
  if (!teacherName || teacherName.length > 30) return { ok: false, message: "이름을 30자 이내로 적어 주세요." };
  const password = tempPassword();
  try {
    if (!(await createTeacher(teacherId, teacherName, password))) return { ok: false, message: "이미 있는 아이디예요(학생·교사 포함). 다른 아이디로 해 주세요." };
  } catch (err) {
    console.error("교사 계정 만들기 오류:", err);
    return { ok: false, message: "만들지 못했어요. 잠시 후 다시 시도하세요." };
  }
  refresh();
  return { ok: true, id: teacherId, password };
}

/** 교사 비밀번호 초기화: 새 임시 비밀번호를 이때 한 번만 보여 준다 */
export async function resetTeacher(id: string): Promise<AccountResult> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  const password = tempPassword();
  try {
    if (!(await resetTeacherPassword(String(id), password))) return { ok: false, message: "그 아이디의 교사 계정을 찾지 못했어요." };
  } catch (err) {
    console.error("교사 비밀번호 초기화 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
  return { ok: true, id: String(id), password };
}
