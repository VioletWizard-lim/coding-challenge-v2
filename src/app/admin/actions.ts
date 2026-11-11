"use server";

import { randomInt } from "node:crypto";
import { refresh } from "next/cache";
import { getSession } from "@/lib/session";
import { createTeacher, listLoadTestAccounts, listStudents, resetTeacherPassword } from "@/lib/teacher";
import { LOAD_TEST_PHRASE, LOAD_TEST_PREFIX } from "@/lib/loadTest";
import { classOptions } from "@/lib/classes";
import { getUserProfile } from "@/lib/auth";
import { getDeleteRequest, listDeleteRequests, setRequestStatus, type DeleteRequest } from "@/lib/deleteRequestStore";
import { canClean, confirmPhrase, yearTable } from "@/lib/yearEnd";
import { getTrialSettings, setTrialAi, setTrialVisible, trialRemaining } from "@/lib/trialStore";
import { trialLimit } from "@/lib/trial";
import { ALL_YEARS, computeYearStats, countYear, deleteYear, listYearStats, restoreRows, saveYearStats, YearStatsNotReadyError } from "@/lib/yearEndStore";

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

/** 반 고르기 값: 비어 있으면 모든 반, "class:2-3" 또는 "prog:2-5" */
const validClass = (cls: string) => cls === "" || /^(class|prog):[^:]{1,20}$/.test(String(cls));

export type YearEndInfo =
  | {
      ok: true;
      year: number;
      canClean: boolean;
      counts: { table: string; label: string; count: number | null }[];
      students: { withRecords: number; all: number };
      classes: { plain: string[]; prog: string[] };
      statsReady: boolean;
      savedYears: { year: number; createdAt: string; rowCount: number }[];
    }
  | { ok: false; message: string };

/** 그 학년도에 지울 기록 수, 지울 수 있는지(학년도가 끝났는지), 남겨 둔 통계 */
export async function loadYearEnd(year: number, cls = ""): Promise<YearEndInfo> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return { ok: false, message: "학년도를 고르세요." };
  try {
    if (!validClass(cls)) return { ok: false, message: "반을 다시 골라 주세요." };
    const [{ counts, students }, stats, all] = await Promise.all([countYear(year, cls), listYearStats(), listStudents()]);
    return {
      ok: true,
      year,
      canClean: canClean(year),
      counts,
      students,
      classes: classOptions(all),
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
 * 지난 학년도의 학생 기록 지우기 (제출·점수·피드백, 학생 계정, AI 대화, 성찰, 메모, 연습, 학생이 만든 문제).
 * 확인 문구가 맞고, 그 학년도 통계를 남겨 둔 뒤에만. 보관 기간(학년도가 끝나기 전)에도 지울 수 있다 (화면에서 경고).
 * allStudents: 그 학년도 기록이 없는 학생 계정까지 모든 학생 계정 지우기 (새 학년 학생을 등록하기 전에만)
 */
export async function cleanYear(
  year: number,
  phrase: string,
  allStudents = false,
  cls = "",
): Promise<{ ok: true; deleted: { table: string; deleted: number | null }[] } | { ok: false; message: string }> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  if (!Number.isInteger(year)) return { ok: false, message: "학년도를 고르세요." };
  if (!validClass(cls)) return { ok: false, message: "반을 다시 골라 주세요." };
  if (String(phrase ?? "").trim() !== confirmPhrase(year, cls)) return { ok: false, message: `확인 문구를 "${confirmPhrase(year, cls)}"라고 정확히 적어 주세요.` };
  try {
    const stats = await listYearStats();
    if (!stats.years.some((y) => y.year === year)) return { ok: false, message: "먼저 '이름 없는 통계 남기기'를 해 주세요." };
    const deleted = await deleteYear(year, !!allStudents, cls);
    refresh();
    return { ok: true, deleted };
  } catch (err) {
    console.error("학년도 정리 오류:", err);
    return { ok: false, message: "지우는 중에 문제가 생겼어요. 다시 눌러 남은 기록을 지울 수 있어요." };
  }
}

/**
 * 백업에서 되살리기: 브라우저가 ZIP을 읽어 표마다 몇 줄씩 보낸다 (참조 번호는 브라우저가 이미 바꿈).
 * 이미 있는 기록은 넣지 않는다 (두 번 올려도 겹치지 않음).
 */
export async function restoreChunk(
  table: string,
  rows: Record<string, unknown>[],
  oldIds: (string | null)[],
): Promise<{ ok: true; ids: [string, number][]; inserted: number; skipped: number } | { ok: false; message: string }> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  if (!yearTable(String(table)) || !Array.isArray(rows) || !Array.isArray(oldIds) || rows.length !== oldIds.length || rows.length > 500) {
    return { ok: false, message: "백업 내용을 읽지 못했어요." };
  }
  try {
    return { ok: true, ...(await restoreRows(String(table), rows, oldIds)) };
  } catch (err) {
    console.error("되살리기 오류:", err);
    return { ok: false, message: String((err as Error)?.message ?? "되살리지 못했어요.") };
  }
}

/* ───────────── 학생 삭제 요청 처리 ───────────── */

/** 학생 한 명 지우기 확인 문구 */
const studentPhrase = (id: string, name: string) => `${id} ${name} 삭제`;

export type DeleteRequestsInfo =
  | { ok: true; ready: boolean; requests: (DeleteRequest & { phrase: string; exists: boolean })[] }
  | { ok: false; message: string };

/** 교사가 보낸 학생 삭제 요청 (기다리는 것 + 최근 처리한 것) */
export async function loadDeleteRequests(): Promise<DeleteRequestsInfo> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  try {
    const { ready, requests } = await listDeleteRequests(50);
    const withInfo = await Promise.all(
      requests.map(async (r) => {
        const profile = r.status === "pending" ? await getUserProfile(r.studentId) : null;
        return { ...r, phrase: studentPhrase(r.studentId, profile?.name ?? r.studentName), exists: !!profile };
      }),
    );
    return { ok: true, ready, requests: withInfo };
  } catch (err) {
    console.error("삭제 요청 조회 오류:", err);
    return { ok: false, message: "삭제 요청을 불러오지 못했어요." };
  }
}

/** 지울 학생의 기록 수 (모든 학년도) */
export async function studentRecordCounts(studentId: string): Promise<{ ok: true; counts: { table: string; label: string; count: number | null }[] } | { ok: false; message: string }> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  try {
    return { ok: true, counts: (await countYear(ALL_YEARS, "", String(studentId))).counts };
  } catch (err) {
    console.error("학생 기록 수 조회 오류:", err);
    return { ok: false, message: "기록 수를 불러오지 못했어요." };
  }
}

/** 요청대로 학생 한 명의 계정과 모든 기록을 지운다 (확인 문구 "아이디 이름 삭제") */
export async function deleteRequestedStudent(
  requestId: number,
  phrase: string,
): Promise<{ ok: true; deleted: number } | { ok: false; message: string }> {
  const session = await getSession();
  if (session?.role !== "admin") return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  try {
    const request = await getDeleteRequest(Number(requestId));
    if (!request || request.status !== "pending") return { ok: false, message: "처리할 요청이 없어요." };
    const profile = await getUserProfile(request.studentId);
    if (profile && profile.role !== "student") return { ok: false, message: "학생 계정만 지울 수 있어요." };
    const expect = studentPhrase(request.studentId, profile?.name ?? request.studentName);
    if (String(phrase ?? "").trim() !== expect) return { ok: false, message: `확인 문구를 "${expect}"라고 정확히 적어 주세요.` };
    const deleted = await deleteYear(ALL_YEARS, true, "", request.studentId);
    await setRequestStatus(request.id, "done", session.id);
    refresh();
    return { ok: true, deleted: deleted.reduce((s, d) => s + (d.deleted ?? 0), 0) };
  } catch (err) {
    console.error("학생 삭제 오류:", err);
    return { ok: false, message: "지우는 중에 문제가 생겼어요. 다시 누르면 남은 기록을 지울 수 있어요." };
  }
}

/** 삭제 요청 거절 (요청한 교사에게 보일 이유) */
export async function rejectDeleteRequest(requestId: number, note: string): Promise<{ ok: boolean; message?: string }> {
  const session = await getSession();
  if (session?.role !== "admin") return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  try {
    return (await setRequestStatus(Number(requestId), "rejected", session.id, String(note ?? "").trim().slice(0, 300)))
      ? { ok: true }
      : { ok: false, message: "처리할 요청이 없어요." };
  } catch (err) {
    console.error("삭제 요청 거절 오류:", err);
    return { ok: false, message: "저장하지 못했어요." };
  }
}

/* ───────── 🧪 체험 페이지 보이기/숨기기 ───────── */

export type TrialPageInfo =
  | { ok: true; visible: boolean; aiOn: boolean; codeSet: boolean; aiReady: boolean; remaining: number | null; limit: number }
  | { ok: false; message: string };

export async function loadTrialPage(): Promise<TrialPageInfo> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  try {
    const [settings, remaining] = await Promise.all([getTrialSettings(), trialRemaining().catch(() => null)]);
    return {
      ok: true,
      visible: settings.visible,
      aiOn: settings.aiOn,
      codeSet: !!process.env.TRY_ACCESS_CODE?.trim(),
      aiReady: !!process.env.ANTHROPIC_API_KEY,
      remaining,
      limit: trialLimit(),
    };
  } catch (err) {
    console.error("체험 페이지 설정 조회 오류:", err);
    return { ok: false, message: "불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export async function saveTrialPage(visible: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession();
  if (session?.role !== "admin") return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  try {
    await setTrialVisible(!!visible, session.id);
    return { ok: true };
  } catch (err) {
    console.error("체험 페이지 설정 저장 오류:", err);
    return { ok: false, message: "저장하지 못했어요. Supabase에 002_app_status.sql이 실행되어 있는지 확인해 주세요." };
  }
}

/** 체험 AI 켜기/끄기 (끄면 이미 체험 코드를 넣은 브라우저도 바로 막힘) */
export async function saveTrialAi(on: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await getSession();
  if (session?.role !== "admin") return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  try {
    await setTrialAi(!!on, session.id);
    return { ok: true };
  } catch (err) {
    console.error("체험 AI 설정 저장 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/* ───────── 부하 테스트 계정 정리 ───────── */

export async function loadLoadTestAccounts(): Promise<{ ok: true; accounts: { id: string; name: string }[] } | { ok: false; message: string }> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  try {
    return { ok: true, accounts: await listLoadTestAccounts() };
  } catch (err) {
    console.error("테스트 계정 조회 오류:", err);
    return { ok: false, message: "불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** loadtest로 시작하는 학생 계정과 그 계정의 모든 기록을 지운다 (백업 없음 — 테스트 기록) */
export async function cleanLoadTestAccounts(phrase: string): Promise<{ ok: true; accounts: number; records: number } | { ok: false; message: string }> {
  if (!(await isAdmin())) return { ok: false, message: "관리자 계정으로 다시 로그인하세요." };
  if (String(phrase ?? "").trim() !== LOAD_TEST_PHRASE) return { ok: false, message: `확인 문구를 "${LOAD_TEST_PHRASE}"라고 정확히 적어 주세요.` };
  try {
    const accounts = (await listLoadTestAccounts()).filter((a) => a.id.startsWith(LOAD_TEST_PREFIX));
    let records = 0;
    for (const a of accounts) {
      const deleted = await deleteYear(ALL_YEARS, true, "", a.id);
      records += deleted.reduce((s, d) => s + (d.deleted ?? 0), 0);
    }
    refresh();
    return { ok: true, accounts: accounts.length, records };
  } catch (err) {
    console.error("테스트 계정 정리 오류:", err);
    return { ok: false, message: "지우는 중에 문제가 생겼어요. 다시 누르면 남은 계정을 지울 수 있어요." };
  }
}
