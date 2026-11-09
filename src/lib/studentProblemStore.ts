import "server-only";
import { db, fetchAll, type RangeQuery } from "./db";
import type { PracticeTest } from "./practice";
import { schoolYearOf, schoolYearRange } from "./yearEnd";
import type { ProblemStatus, Share, StudentProblem, StudentProblemForTeacher, StudentProblemInput } from "./studentProblem";

type Row = {
  id: number;
  author_id: string;
  subject: string;
  class_key: string;
  title: string;
  description: string;
  conditions: unknown;
  starter_code: string;
  tests: unknown;
  solution: string;
  solution_init: string;
  solution_log: unknown;
  share: string;
  status: string;
  review_note: string;
  flagged_by: string | null;
  created_at: string;
  updated_at: string;
};

type AttemptRow = {
  id: number;
  problem_id: number;
  user_id: string;
  code: string | null;
  init_code: string | null;
  edit_log: unknown;
  passed: number | null;
  checks: number | null;
  solved_at: string | null;
};

const tests = (v: unknown): PracticeTest[] =>
  Array.isArray(v) ? v.map((t) => ({ inputs: Array.isArray(t?.inputs) ? t.inputs.map(String) : [], output: String(t?.output ?? "") })) : [];

const STATUSES: ProblemStatus[] = ["private", "pending", "approved", "rejected"];

function fromRow(r: Row, me: string | null, attempt?: AttemptRow): StudentProblemForTeacher {
  return {
    id: Number(r.id),
    subject: r.subject,
    title: r.title,
    description: r.description,
    conditions: Array.isArray(r.conditions) ? r.conditions.map(String) : [],
    starterCode: r.starter_code ?? "",
    tests: tests(r.tests),
    share: (r.share === "class" ? "class" : "private") as Share,
    status: STATUSES.includes(r.status as ProblemStatus) ? (r.status as ProblemStatus) : "private",
    reviewNote: r.review_note ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    mine: me !== null && r.author_id === me,
    passed: attempt?.passed ?? null,
    checks: Number(attempt?.checks ?? 0),
    solvedAt: attempt?.solved_at ?? null,
    flaggedBy: r.flagged_by === "student" || r.flagged_by === "teacher" ? r.flagged_by : null,
    authorId: r.author_id,
    classKey: r.class_key ?? "",
    solution: r.solution ?? "",
    solutionInit: r.solution_init ?? "",
    solutionLog: r.solution_log,
    solvers: 0,
  };
}

/** 학생에게 보낼 때: 만든 사람·답·답을 쓴 과정을 뺀다 (내가 만든 문제는 내 답만 함께) */
export function forStudent(p: StudentProblemForTeacher): StudentProblem & { solution?: string } {
  return {
    id: p.id,
    subject: p.subject,
    title: p.title,
    description: p.description,
    conditions: p.conditions,
    starterCode: p.starterCode,
    tests: p.tests,
    share: p.share,
    status: p.status,
    reviewNote: p.reviewNote,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    mine: p.mine,
    passed: p.passed,
    checks: p.checks,
    solvedAt: p.solvedAt,
    flaggedBy: p.flaggedBy,
    ...(p.mine ? { solution: p.solution } : {}),
  };
}

const tableMissing = (message: string) =>
  /student_problem/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

export class StudentProblemsNotReadyError extends Error {}

function check(error: { message: string } | null, what: string) {
  if (!error) return;
  if (tableMissing(error.message)) throw new StudentProblemsNotReadyError(error.message);
  throw new Error(`${what}: ${error.message}`);
}

/**
 * "같은 반 친구" 문제는 이번 학년도에 만든 것만: 학년이 바뀌면 같은 "2-3반"이어도 다른 학생들이므로.
 * 학생이 만든 문제는 학년도 말 정리에서 지우지 않고 남는다 (만든 학생은 지난 문제도 계속 봄).
 */
const thisYearStart = () => schoolYearRange(schoolYearOf(new Date())).from;
const inThisYear = (createdAt: string) => new Date(createdAt) >= new Date(thisYearStart());

const LIST_COLUMNS =
  "id, author_id, subject, class_key, title, description, conditions, starter_code, tests, share, status, review_note, flagged_by, created_at, updated_at";

async function attemptsOf(userId: string, ids: number[]): Promise<Map<number, AttemptRow>> {
  if (!ids.length) return new Map();
  const { data, error } = await db()
    .from("student_problem_attempts")
    .select("id, problem_id, user_id, passed, checks, solved_at")
    .eq("user_id", userId)
    .in("problem_id", ids);
  check(error, "학생 문제 기록 조회 실패");
  return new Map(((data ?? []) as AttemptRow[]).map((a) => [Number(a.problem_id), a]));
}

/**
 * 연습 탭: 내가 만든 문제 + 같은 반 친구가 만들어 승인된 문제 (과목마다 내 반 기준). 표가 없으면 ready=false
 * classKeys: 과목 → 내 "학년-반"
 */
export async function listForStudent(
  userId: string,
  classKeys: Record<string, string>,
): Promise<{ ready: boolean; mine: StudentProblem[]; classmates: StudentProblem[] }> {
  try {
    const mineRows = await fetchAll<Row>(
      () =>
        db()
          .from("student_problems")
          .select(`${LIST_COLUMNS}, solution`)
          .eq("author_id", userId)
          .order("id", { ascending: false }) as unknown as RangeQuery<Row>,
      200,
    );
    const shared: Row[] = [];
    for (const [subject, key] of Object.entries(classKeys)) {
      if (!key) continue;
      const rows = await fetchAll<Row>(
        () =>
          db()
            .from("student_problems")
            .select(LIST_COLUMNS)
            .eq("subject", subject)
            .eq("class_key", key)
            .eq("status", "approved")
            .neq("author_id", userId)
            .gte("created_at", thisYearStart())
            .order("id", { ascending: false }) as unknown as RangeQuery<Row>,
        200,
      );
      shared.push(...rows.filter((r) => r.author_id !== userId && r.status === "approved" && inThisYear(r.created_at)));
    }
    const attempts = await attemptsOf(userId, [...mineRows, ...shared].map((r) => Number(r.id)));
    return {
      ready: true,
      mine: mineRows.map((r) => forStudent(fromRow(r, userId, attempts.get(Number(r.id))))),
      classmates: shared.map((r) => forStudent(fromRow({ ...r, solution: "" } as Row, userId, attempts.get(Number(r.id))))),
    };
  } catch (err) {
    if (err instanceof StudentProblemsNotReadyError || tableMissing(String((err as Error)?.message ?? err))) {
      return { ready: false, mine: [], classmates: [] };
    }
    throw err;
  }
}

/** 문제 하나 (참고: 답 포함 — 학생에게 보낼 때는 forStudent로) */
export async function getStudentProblem(id: number): Promise<StudentProblemForTeacher | null> {
  const { data, error } = await db().from("student_problems").select("*").eq("id", id).maybeSingle<Row>();
  check(error, "학생 문제 조회 실패");
  return data ? fromRow(data, null) : null;
}

/** 이 학생이 풀 수 있는 문제인지: 내가 만든 것, 또는 같은 반(과목 기준)에 승인된 친구 문제 */
export async function solvableBy(id: number, userId: string, classKeys: Record<string, string>): Promise<StudentProblemForTeacher | null> {
  const p = await getStudentProblem(id);
  if (!p) return null;
  if (p.authorId === userId) return { ...p, mine: true };
  return p.status === "approved" && p.classKey !== "" && classKeys[p.subject] === p.classKey && inThisYear(p.createdAt) ? p : null;
}

export async function countMine(userId: string): Promise<number> {
  const { count, error } = await db().from("student_problems").select("id", { count: "exact", head: true }).eq("author_id", userId);
  check(error, "학생 문제 수 조회 실패");
  return count ?? 0;
}

/** 새로 만들기(id 없음) 또는 고치기. 고치면 공개 범위에 따라 다시 "나만" 또는 "승인 기다림"이 된다 */
export async function saveStudentProblem(
  authorId: string,
  classKey: string,
  input: StudentProblemInput,
  solutionRec: { init: string; log: unknown },
  id?: number,
): Promise<number | null> {
  const row = {
    subject: input.subject,
    class_key: classKey,
    title: input.title,
    description: input.description,
    conditions: input.conditions,
    starter_code: input.starterCode,
    tests: input.tests,
    solution: input.solution,
    solution_init: solutionRec.init,
    solution_log: solutionRec.log,
    share: input.share,
    status: input.share === "class" ? "pending" : "private",
    review_note: "",
    reviewed_by: null,
    reviewed_at: null,
    updated_at: new Date().toISOString(),
  };
  if (id === undefined) {
    const { data, error } = await db()
      .from("student_problems")
      .insert({ ...row, author_id: authorId })
      .select("id")
      .single<{ id: number }>();
    check(error, "학생 문제 저장 실패");
    return Number(data!.id);
  }
  const { data, error } = await db().from("student_problems").update(row).eq("id", id).eq("author_id", authorId).select("id");
  check(error, "학생 문제 저장 실패");
  return (data ?? []).length ? id : null;
}

export async function deleteStudentProblem(id: number, authorId: string): Promise<boolean> {
  const { data, error } = await db().from("student_problems").delete().eq("id", id).eq("author_id", authorId).select("id");
  check(error, "학생 문제 삭제 실패");
  return (data ?? []).length > 0;
}

/** 내가 이 문제를 푼 기록 (다른 컴퓨터에서 이어 쓰기) */
export async function getAttempt(problemId: number, userId: string): Promise<{ code: string; init: string; log: unknown } | null> {
  const { data, error } = await db()
    .from("student_problem_attempts")
    .select("code, init_code, edit_log")
    .eq("problem_id", problemId)
    .eq("user_id", userId)
    .maybeSingle<AttemptRow>();
  check(error, "학생 문제 기록 조회 실패");
  return data && data.code !== null ? { code: data.code, init: data.init_code ?? "", log: data.edit_log } : null;
}

/** 확인할 때마다 저장 (처음 모두 통과한 시각은 남겨 둔다) */
export async function saveAttempt(
  problemId: number,
  userId: string,
  work: { code: string; init: string; log: unknown; passed: number; total: number },
): Promise<{ solvedAt: string | null; checks: number; firstSolve: boolean }> {
  const { data: current, error: readError } = await db()
    .from("student_problem_attempts")
    .select("id, checks, solved_at")
    .eq("problem_id", problemId)
    .eq("user_id", userId)
    .maybeSingle<AttemptRow>();
  check(readError, "학생 문제 기록 조회 실패");
  const now = new Date().toISOString();
  const solvedAt = current?.solved_at ?? (work.passed === work.total ? now : null);
  const checks = Number(current?.checks ?? 0) + 1;
  const row = { code: work.code, init_code: work.init, edit_log: work.log, passed: work.passed, checks, solved_at: solvedAt, updated_at: now };
  const { error } = current
    ? await db().from("student_problem_attempts").update(row).eq("id", current.id)
    : await db().from("student_problem_attempts").insert({ ...row, problem_id: problemId, user_id: userId });
  check(error, "학생 문제 기록 저장 실패");
  return { solvedAt, checks, firstSolve: !current?.solved_at && solvedAt !== null };
}

/** 이상한 문제 표시 (학생: 풀 수 있는 문제만, 교사: 표시·풀기) */
export async function setStudentProblemFlag(id: number, by: "student" | "teacher" | null): Promise<boolean> {
  const { data, error } = await db()
    .from("student_problems")
    .update({
      flagged_by: by,
      flag_note: by === "student" ? "학생이 이상한 문제라고 알림" : by ? "교사가 표시함" : null,
      flagged_at: by ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id");
  check(error, "학생 문제 표시 실패");
  return (data ?? []).length > 0;
}

/* ───────── 교사 ───────── */

/** 교사용: 모든 학생 문제 (최근 것부터, 답·과정 포함, 푼 학생 수). 표가 없으면 ready=false */
export async function listForTeacher(): Promise<{ ready: boolean; problems: StudentProblemForTeacher[] }> {
  try {
    const rows = await fetchAll<Row>(
      () => db().from("student_problems").select("*").order("id", { ascending: false }) as unknown as RangeQuery<Row>,
      200,
    );
    const solved = await fetchAll<Pick<AttemptRow, "id" | "problem_id" | "user_id" | "solved_at">>(
      () =>
        db()
          .from("student_problem_attempts")
          .select("id, problem_id, user_id, solved_at")
          .order("id") as unknown as RangeQuery<Pick<AttemptRow, "id" | "problem_id" | "user_id" | "solved_at">>,
    );
    const solvers = new Map<number, number>();
    for (const a of solved) if (a.solved_at) solvers.set(Number(a.problem_id), (solvers.get(Number(a.problem_id)) ?? 0) + 1);
    return { ready: true, problems: rows.map((r) => ({ ...fromRow(r, null), solvers: solvers.get(Number(r.id)) ?? 0 })) };
  } catch (err) {
    if (err instanceof StudentProblemsNotReadyError || tableMissing(String((err as Error)?.message ?? err))) return { ready: false, problems: [] };
    throw err;
  }
}

/** 승인(approved) 또는 다시 고쳐 달라기(rejected). 반 친구와 풀기로 보낸 문제만 */
export async function reviewStudentProblem(id: number, teacherId: string, approve: boolean, note: string): Promise<boolean> {
  const { data, error } = await db()
    .from("student_problems")
    .update({
      status: approve ? "approved" : "rejected",
      review_note: approve ? "" : note,
      reviewed_by: teacherId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("share", "class")
    .select("id");
  check(error, "학생 문제 승인 저장 실패");
  return (data ?? []).length > 0;
}

/** 교사 처음 화면용: 승인 기다리는 학생 문제 수 (표가 없으면 0) */
export async function countPendingStudentProblems(): Promise<number> {
  const { count, error } = await db().from("student_problems").select("id", { count: "exact", head: true }).eq("status", "pending");
  if (error && tableMissing(error.message)) return 0;
  check(error, "학생 문제 수 조회 실패");
  return count ?? 0;
}
