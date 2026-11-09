"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { getSession } from "@/lib/session";
import { createTeacher, resetTeacherPassword } from "@/lib/teacher";
import { canClean, confirmPhrase } from "@/lib/yearEnd";
import { computeYearStats, countYear, deleteYear, listYearStats, saveYearStats, YearStatsNotReadyError } from "@/lib/yearEndStore";

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

/* ───────────── 학년도 말 정리 ───────────── */

export type YearEndInfo =
  | {
      ok: true;
      year: number;
      canClean: boolean;
      counts: { table: string; label: string; count: number | null }[];
      statsReady: boolean;
      savedYears: { year: number; createdAt: string; rowCount: number }[];
    }
  | { ok: false; message: string };

/** 그 학년도에 지울 기록 수, 지울 수 있는지(학년도가 끝났는지), 남겨 둔 통계 */
export async function loadYearEnd(year: number): Promise<YearEndInfo> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return { ok: false, message: "학년도를 고르세요." };
  try {
    const [counts, stats] = await Promise.all([countYear(year), listYearStats()]);
    return {
      ok: true,
      year,
      canClean: canClean(year),
      counts,
      statsReady: stats.ready,
      savedYears: stats.years.map((y) => ({ year: y.year, createdAt: y.createdAt, rowCount: y.rows.length })),
    };
  } catch (err) {
    console.error("학년도 정리 조회 오류:", err);
    return { ok: false, message: "불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 이름 없는 통계를 계산해 사이트에 남긴다 (지우기 전에 반드시) */
export async function keepYearStats(year: number): Promise<{ ok: true; rowCount: number } | { ok: false; message: string }> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  if (!Number.isInteger(year)) return { ok: false, message: "학년도를 고르세요." };
  try {
    const rows = await computeYearStats(year);
    await saveYearStats(year, rows);
    return { ok: true, rowCount: rows.length };
  } catch (err) {
    if (err instanceof YearStatsNotReadyError) return { ok: false, message: "통계를 남기려면 Supabase에서 019 SQL을 먼저 실행해 주세요." };
    console.error("통계 남기기 오류:", err);
    return { ok: false, message: "통계를 만들지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/**
 * 지난 학년도의 학습 활동 기록 지우기. 학년도가 끝났고(다음 해 3월 1일부터), 확인 문구가 맞고,
 * 그 학년도 통계를 남겨 둔 뒤에만. 제출·채점·계정·문제는 지우지 않는다.
 */
export async function cleanYear(
  year: number,
  phrase: string,
): Promise<{ ok: true; deleted: { table: string; deleted: number | null }[] } | { ok: false; message: string }> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  if (!Number.isInteger(year)) return { ok: false, message: "학년도를 고르세요." };
  if (!canClean(year)) return { ok: false, message: `${year}학년도는 아직 끝나지 않았어요. ${year + 1}년 3월 1일부터 지울 수 있어요.` };
  if (String(phrase ?? "").trim() !== confirmPhrase(year)) return { ok: false, message: `확인 문구를 "${confirmPhrase(year)}"라고 정확히 적어 주세요.` };
  try {
    const stats = await listYearStats();
    if (!stats.years.some((y) => y.year === year)) return { ok: false, message: "먼저 '이름 없는 통계 남기기'를 해 주세요." };
    const deleted = await deleteYear(year);
    refresh();
    return { ok: true, deleted };
  } catch (err) {
    console.error("학년도 정리 오류:", err);
    return { ok: false, message: "지우는 중에 문제가 생겼어요. 다시 눌러 남은 기록을 지울 수 있어요." };
  }
}
