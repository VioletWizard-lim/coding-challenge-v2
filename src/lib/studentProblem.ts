/**
 * 학생이 직접 만든 문제: 브라우저·서버가 함께 쓰는 순수 함수와 타입. (DB는 studentProblemStore.ts)
 *
 * 학생이 문제·예시(입력과 기대 출력)·내 답을 쓰고, 브라우저에서 내 답으로 예시를 모두 통과해야 저장된다.
 * 공개 범위는 둘 중 하나: "나만 풀기" 또는 "선생님 승인 후 같은 반 친구와 풀기".
 * 학생 코드는 서버에서 실행하지 않는다(브라우저 Pyodide만). 승인할 때 선생님도 자기 브라우저에서 확인할 수 있다.
 * 단위 테스트: studentProblem.test.ts
 */
import type { Problem } from "./problemBank";
import { MAX_TESTS, MIN_TESTS, normalizeOutput, type PracticeTest } from "./practice";

export type Share = "private" | "class";
/** private: 나만 / pending: 승인 기다림 / approved: 반 친구에게 공개 / rejected: 다시 고쳐 주세요 */
export type ProblemStatus = "private" | "pending" | "approved" | "rejected";

export type StudentProblemInput = {
  subject: string;
  title: string;
  description: string;
  conditions: string[];
  starterCode: string;
  tests: PracticeTest[];
  /** 만든 학생의 답 (같은 반 친구에게는 보내지 않음) */
  solution: string;
  share: Share;
};

export type StudentProblem = Omit<StudentProblemInput, "solution"> & {
  id: number;
  status: ProblemStatus;
  /** 선생님이 다시 고쳐 달라고 할 때 남긴 말 */
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
  /** 내가 만든 문제인지 (반 친구 문제는 false) */
  mine: boolean;
  /** 이 문제를 푼 내 기록 */
  passed: number | null;
  checks: number;
  solvedAt: string | null;
  flaggedBy: "student" | "teacher" | null;
};

/** 선생님 화면용: 만든 학생, 답, 답을 쓴 과정 */
export type StudentProblemForTeacher = StudentProblem & {
  authorId: string;
  classKey: string;
  solution: string;
  solutionInit: string;
  solutionLog: unknown;
  solvers: number;
};

export const MAX_TITLE = 40;
export const MAX_DESCRIPTION = 2000;
export const MAX_CONDITION = 200;
export const MAX_CONDITIONS = 8;
export const MAX_IO = 2000;
export const MAX_INPUT_LINES = 20;
export const MAX_CODE = 5000;
/** 학생 한 명이 만들 수 있는 문제 수 (지우면 다시 만들 수 있음) */
export const MAX_PROBLEMS_PER_STUDENT = 30;

export const STATUS_LABEL: Record<ProblemStatus, string> = {
  private: "🔒 나만 풀기",
  pending: "⏳ 선생님 승인 기다리는 중",
  approved: "👥 반 친구에게 공개됨",
  rejected: "✏️ 다시 고쳐 주세요",
};

/** 학생 문제의 작성 기록·AI 대화 키 (수업 문제 "2-3", 연습 문제 "P12"와 겹치지 않게) */
export const studentProblemKey = (id: number) => `S${id}`;

/** 공개 범위를 고르면 처음 상태 */
export const statusFor = (share: Share): ProblemStatus => (share === "class" ? "pending" : "private");

/** 입력 칸 글(한 줄에 하나) → input()에 들어갈 줄들 */
export const inputLines = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l, i, all) => l !== "" || all.slice(i).some((x) => x.trim() !== ""));

/** 브라우저에서 온 문제를 정리하고 확인한다. 문제가 있으면 학생에게 보일 말을 돌려준다 */
export function validateStudentProblem(value: unknown, subjects: string[]): StudentProblemInput | string {
  if (!value || typeof value !== "object") return "문제를 다시 써 주세요.";
  const v = value as Partial<StudentProblemInput>;
  const subject = String(v.subject ?? "");
  if (!subjects.includes(subject)) return "과목이 맞지 않아요.";
  const title = String(v.title ?? "").trim();
  const description = String(v.description ?? "").trim();
  if (!title) return "제목을 써 주세요.";
  if (title.length > MAX_TITLE) return `제목은 ${MAX_TITLE}자까지 쓸 수 있어요.`;
  if (!description) return "문제 설명을 써 주세요.";
  if (description.length > MAX_DESCRIPTION) return `문제 설명은 ${MAX_DESCRIPTION}자까지 쓸 수 있어요.`;
  const conditions = (Array.isArray(v.conditions) ? v.conditions : []).map((c) => String(c ?? "").trim()).filter(Boolean);
  if (conditions.length > MAX_CONDITIONS || conditions.some((c) => c.length > MAX_CONDITION)) {
    return `조건은 ${MAX_CONDITIONS}개, 한 줄에 ${MAX_CONDITION}자까지 쓸 수 있어요.`;
  }
  const tests = (Array.isArray(v.tests) ? v.tests : []).map((t) => ({
    inputs: (Array.isArray(t?.inputs) ? t.inputs : []).map((s: unknown) => String(s ?? "").replace(/[\r\n]+/g, " ")),
    output: String(t?.output ?? "").replace(/\r\n?/g, "\n"),
  }));
  if (tests.length < MIN_TESTS || tests.length > MAX_TESTS) return `예시는 ${MIN_TESTS}~${MAX_TESTS}개 만들어 주세요.`;
  if (tests.some((t) => !normalizeOutput(t.output))) return "예시마다 기대 출력을 써 주세요.";
  if (tests.some((t) => t.output.length > MAX_IO || t.inputs.length > MAX_INPUT_LINES || t.inputs.join("\n").length > MAX_IO)) {
    return "예시가 너무 길어요.";
  }
  if (new Set(tests.map((t) => JSON.stringify(t.inputs))).size < tests.length) return "입력이 똑같은 예시가 있어요. 서로 다른 입력으로 만들어 주세요.";
  const starterCode = String(v.starterCode ?? "").replace(/\s+$/, "");
  const solution = String(v.solution ?? "");
  if (!solution.trim()) return "내 답 코드를 써 주세요.";
  if (solution.length > MAX_CODE || starterCode.length > MAX_CODE) return `코드는 ${MAX_CODE}자까지 쓸 수 있어요.`;
  const share: Share = v.share === "class" ? "class" : "private";
  return { subject, title, description, conditions, starterCode, tests, solution, share };
}

/** 화면에 쓰는 문제 모양 (수업 문제와 같은 ProblemView로 보여 준다) */
export function studentAsProblem(p: Pick<StudentProblemInput, "subject" | "title" | "description" | "conditions" | "tests" | "starterCode">): Problem {
  return {
    id: null,
    subject: p.subject,
    number: "친구 문제",
    title: p.title,
    difficulty: null,
    description: p.description,
    conditions: p.conditions.join("\n"),
    examples: p.tests.map((t) => ({ input: t.inputs.join("\n"), output: t.output })),
    goal: "",
    challenge: "",
    starterCode: p.starterCode,
    openAt: null,
  };
}

/** "같은 반" 비교용 키: 학년-반 (프로그래밍 과목은 프로그래밍 반) */
export const classKeyOf = (gc: { grade: number | string | null; class: number | string | null }) =>
  gc.grade === null || gc.class === null || gc.grade === "" || gc.class === "" ? "" : `${gc.grade}-${gc.class}`;
