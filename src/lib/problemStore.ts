import "server-only";
import { db, fetchAll } from "./db";
import { isOpen, parseExamples, sortProblems, staticProblems, type Problem, type ProblemInput } from "./problemBank";

type ProblemRow = {
  id: number;
  subject: string;
  number: string;
  title: string;
  description: string;
  starter_code: string;
  open_at: string | null;
  // 004_problem_fields.sql 실행 전에는 없는 칸
  difficulty?: number | null;
  conditions?: string;
  examples?: unknown;
  goal?: string;
  challenge?: string;
};

const fromRow = (r: ProblemRow): Problem => ({
  id: r.id,
  subject: r.subject,
  number: r.number,
  title: r.title,
  difficulty: r.difficulty ?? null,
  description: r.description ?? "",
  conditions: r.conditions ?? "",
  examples: parseExamples(r.examples),
  goal: r.goal ?? "",
  challenge: r.challenge ?? "",
  starterCode: r.starter_code ?? "",
  openAt: r.open_at,
});

/** problems 표가 없어서(003_problems.sql 실행 전) 생긴 오류인지 */
const tableMissing = (message: string) => /problems/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

/** 004_problem_fields.sql로 더한 칸이 없어서 생긴 오류인지 */
const fieldsMissing = (message: string) =>
  /(difficulty|conditions|examples|goal|challenge)/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

export type ProblemList = { problems: Problem[]; tableReady: boolean; fieldsReady: boolean; now: string };

/**
 * 모든 문제 (교사용). 표가 없으면(003 실행 전) 코드에 든 목록을,
 * 양식 칸이 없으면(004 실행 전) 있는 칸만 읽어 돌려주고 그 사실을 알려 준다.
 */
export async function listAllProblems(): Promise<ProblemList> {
  const now = new Date().toISOString();
  try {
    const rows = await fetchAll<ProblemRow>(() => db().from("problems").select("*").order("id"));
    const { error } = await db().from("problems").select("difficulty").limit(1);
    if (error && !fieldsMissing(error.message)) throw new Error(error.message);
    return { problems: sortProblems(rows.map(fromRow)), tableReady: true, fieldsReady: !error, now };
  } catch (err) {
    const message = String((err as Error).message);
    if (!tableMissing(message)) throw err;
    return { problems: staticProblems(), tableReady: false, fieldsReady: false, now };
  }
}

/**
 * 학생에게 보일 문제: 지금 공개된 것만 (공개 시각은 서버 시계로 판단).
 * 표가 아직 없으면 코드에 든 목록을 쓴다.
 */
export async function listOpenProblems(subjects: string[]): Promise<Problem[]> {
  const { problems } = await listAllProblems();
  const now = new Date();
  return problems.filter((p) => subjects.includes(p.subject) && isOpen(p, now));
}

/** 공개된 문제 하나 (제출할 때 확인용) */
export async function findOpenProblem(subject: string, number: string): Promise<Problem | null> {
  const { problems } = await listAllProblems();
  return problems.find((p) => p.subject === subject && p.number === number && isOpen(p, new Date())) ?? null;
}

const toRow = (p: ProblemInput) => ({
  subject: p.subject,
  number: p.number,
  title: p.title.trim(),
  difficulty: p.difficulty,
  description: p.description,
  conditions: p.conditions,
  examples: p.examples,
  goal: p.goal,
  challenge: p.challenge,
  starter_code: p.starterCode,
  open_at: p.openAt,
  updated_at: new Date().toISOString(),
});

/** 문제를 새로 만들거나(id 없음) 고친다. 같은 과목에 같은 번호가 있으면 "duplicate", 양식 칸이 없으면 "fields-missing" */
export async function saveProblem(id: number | null, p: ProblemInput): Promise<"ok" | "duplicate" | "fields-missing"> {
  const query = id === null ? db().from("problems").insert(toRow(p)) : db().from("problems").update(toRow(p)).eq("id", id);
  const { error } = await query;
  if (error?.code === "23505") return "duplicate";
  if (error && fieldsMissing(error.message)) return "fields-missing";
  if (error) throw new Error(`문제 저장 실패: ${error.message}`);
  return "ok";
}

export async function deleteProblem(id: number) {
  const { error } = await db().from("problems").delete().eq("id", id);
  if (error) throw new Error(`문제 삭제 실패: ${error.message}`);
}
