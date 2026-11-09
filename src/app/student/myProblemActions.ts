"use server";

import { refresh } from "next/cache";
import { getUserProfile } from "@/lib/auth";
import { isValidLog } from "@/lib/editLog";
import { allowedSubjects, gradeClassFor } from "@/lib/problems";
import { getSession } from "@/lib/session";
import {
  classKeyOf,
  MAX_PROBLEMS_PER_STUDENT,
  validateStudentProblem,
  type StudentProblem,
  type StudentProblemInput,
} from "@/lib/studentProblem";
import {
  countMine,
  deleteStudentProblem,
  getAttempt,
  getStudentProblem,
  listForStudent,
  saveAttempt,
  saveStudentProblem,
  setStudentProblemFlag,
  solvableBy,
  StudentProblemsNotReadyError,
} from "@/lib/studentProblemStore";
import type { UserRow } from "@/lib/db";

const MAX_CODE = 100_000;

/** 과목마다 내 "학년-반" (프로그래밍은 프로그래밍 반) — 같은 반 친구 문제를 고를 때 쓴다 */
async function classKeysOf(profile: Pick<UserRow, "subjects" | "grade" | "class" | "programming_grade" | "programming_class">): Promise<Record<string, string>> {
  return Object.fromEntries(allowedSubjects(profile.subjects).map((s) => [s, classKeyOf(gradeClassFor(profile, s))]));
}

async function me() {
  const session = await getSession();
  if (!session || session.role !== "student") return null;
  const profile = await getUserProfile(session.id);
  return profile ? { id: session.id, profile, classKeys: await classKeysOf(profile) } : null;
}

export type StudentProblemsResult =
  | { ok: true; ready: boolean; mine: (StudentProblem & { solution?: string })[]; classmates: StudentProblem[] }
  | { ok: false; error: string };

/** 연습 탭: 내가 만든 문제와 같은 반 친구가 만든(선생님이 승인한) 문제 */
export async function loadStudentProblems(): Promise<StudentProblemsResult> {
  try {
    const user = await me();
    if (!user) return { ok: false, error: "다시 로그인하세요." };
    return { ok: true, ...(await listForStudent(user.id, user.classKeys)) };
  } catch (err) {
    console.error("학생 문제 조회 오류:", err);
    return { ok: false, error: "문제를 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/**
 * 내가 만든 문제 저장 (id가 있으면 고치기). 브라우저에서 내 답으로 예시를 모두 통과한 뒤에만 부른다.
 * 반 친구와 풀기로 하면 선생님 승인을 기다린다(고쳐도 다시 승인을 받는다).
 */
export async function saveMyProblem(
  input: StudentProblemInput,
  solutionRec: { init: string; log: unknown },
  id?: number,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    const user = await me();
    if (!user) return { ok: false, error: "다시 로그인하세요." };
    const problem = validateStudentProblem(input, allowedSubjects(user.profile.subjects));
    if (typeof problem === "string") return { ok: false, error: problem };
    const init = String(solutionRec?.init ?? "");
    if (init.length > MAX_CODE || !isValidLog(solutionRec?.log)) return { ok: false, error: "내 답을 쓴 기록을 읽지 못했어요. 새로고침 후 다시 저장해 주세요." };
    if (id === undefined && (await countMine(user.id)) >= MAX_PROBLEMS_PER_STUDENT) {
      return { ok: false, error: `문제는 ${MAX_PROBLEMS_PER_STUDENT}개까지 만들 수 있어요. 안 쓰는 문제를 지운 뒤 만들어 주세요.` };
    }
    const saved = await saveStudentProblem(user.id, user.classKeys[problem.subject] ?? "", problem, { init, log: solutionRec.log }, id);
    if (saved === null) return { ok: false, error: "문제를 찾지 못했어요." };
    return { ok: true, id: saved };
  } catch (err) {
    if (err instanceof StudentProblemsNotReadyError) return { ok: false, error: "선생님이 이 기능을 준비하고 있어요." };
    console.error("학생 문제 저장 오류:", err);
    return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export async function deleteMyProblem(id: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await me();
    if (!user) return { ok: false, error: "다시 로그인하세요." };
    return (await deleteStudentProblem(Number(id), user.id)) ? { ok: true } : { ok: false, error: "문제를 찾지 못했어요." };
  } catch (err) {
    console.error("학생 문제 삭제 오류:", err);
    return { ok: false, error: "지우지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 고치기 화면: 내가 만든 문제 (답과 답을 쓴 과정 포함) */
export async function loadMyProblemForEdit(
  id: number,
): Promise<{ ok: true; problem: StudentProblemInput; solutionInit: string; solutionLog: unknown } | { ok: false; error: string }> {
  try {
    const user = await me();
    if (!user) return { ok: false, error: "다시 로그인하세요." };
    const p = await getStudentProblem(Number(id));
    if (!p || p.authorId !== user.id) return { ok: false, error: "문제를 찾지 못했어요." };
    const { subject, title, description, conditions, starterCode, tests, solution, share } = p;
    return { ok: true, problem: { subject, title, description, conditions, starterCode, tests, solution, share }, solutionInit: p.solutionInit, solutionLog: p.solutionLog };
  } catch (err) {
    console.error("학생 문제 조회 오류:", err);
    return { ok: false, error: "문제를 불러오지 못했어요." };
  }
}

/** 이 문제를 푼 내 기록 (다른 컴퓨터에서 이어 쓰기) */
export async function loadStudentProblemWork(id: number): Promise<{ code: string; init: string; log: unknown } | null> {
  try {
    const user = await me();
    if (!user || !(await solvableBy(Number(id), user.id, user.classKeys))) return null;
    return await getAttempt(Number(id), user.id);
  } catch (err) {
    console.error("학생 문제 기록 조회 오류:", err);
    return null;
  }
}

/** 확인 버튼을 누를 때마다: 지금 코드·작성 기록·통과 수를 저장 */
export async function saveStudentProblemCheck(
  id: number,
  work: { code: string; init: string; log: unknown; passed: number },
): Promise<{ ok: true; solvedAt: string | null; checks: number } | { ok: false; error: string }> {
  const code = String(work?.code ?? "");
  const init = String(work?.init ?? "");
  if (code.length > MAX_CODE || init.length > MAX_CODE || !isValidLog(work?.log)) {
    return { ok: false, error: "작성 기록을 저장하지 못했어요. 새로고침 후 다시 확인해 주세요." };
  }
  try {
    const user = await me();
    if (!user) return { ok: false, error: "다시 로그인하세요." };
    const p = await solvableBy(Number(id), user.id, user.classKeys);
    if (!p) return { ok: false, error: "문제를 찾지 못했어요." };
    const total = p.tests.length;
    const passed = Math.max(0, Math.min(total, Math.floor(Number(work.passed) || 0)));
    const { firstSolve, ...saved } = await saveAttempt(p.id, user.id, { code, init, log: work.log, passed, total });
    if (firstSolve) refresh(); // 처음 통과: 업적 다시 계산
    return { ok: true, ...saved };
  } catch (err) {
    console.error("학생 문제 기록 저장 오류:", err);
    return { ok: false, error: "기록을 저장하지 못했어요. 코드는 이 브라우저에 남아 있어요." };
  }
}

/** 이상한 친구 문제를 선생님께 알린다 */
export async function flagStudentProblem(id: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await me();
    if (!user) return { ok: false, error: "다시 로그인하세요." };
    if (!(await solvableBy(Number(id), user.id, user.classKeys))) return { ok: false, error: "문제를 찾지 못했어요." };
    return (await setStudentProblemFlag(Number(id), "student")) ? { ok: true } : { ok: false, error: "찾지 못했어요." };
  } catch (err) {
    console.error("학생 문제 표시 오류:", err);
    return { ok: false, error: "알리지 못했어요. 잠시 후 다시 시도하세요." };
  }
}
