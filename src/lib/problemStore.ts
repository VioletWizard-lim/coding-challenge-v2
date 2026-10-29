import "server-only";
import { db, fetchAll } from "./db";
import { isOpen, sortProblems, staticProblems, type Problem, type ProblemInput } from "./problemBank";

type ProblemRow = {
  id: number;
  subject: string;
  number: string;
  title: string;
  description: string;
  starter_code: string;
  open_at: string | null;
};

const fromRow = (r: ProblemRow): Problem => ({
  id: r.id,
  subject: r.subject,
  number: r.number,
  title: r.title,
  description: r.description ?? "",
  starterCode: r.starter_code ?? "",
  openAt: r.open_at,
});

/** problems 표가 없어서(003_problems.sql 실행 전) 생긴 오류인지 */
const tableMissing = (message: string) => /problems/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

/** 모든 문제 (교사용). 표가 없으면 코드에 든 목록과 함께 표가 없다고 알려 준다 */
export async function listAllProblems(): Promise<{ problems: Problem[]; tableReady: boolean; now: string }> {
  try {
    const rows = await fetchAll<ProblemRow>(() =>
      db().from("problems").select("id, subject, number, title, description, starter_code, open_at").order("id"),
    );
    return { problems: sortProblems(rows.map(fromRow)), tableReady: true, now: new Date().toISOString() };
  } catch (err) {
    const message = String((err as Error).message);
    if (!tableMissing(message)) throw err;
    return { problems: staticProblems(), tableReady: false, now: new Date().toISOString() };
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
  description: p.description,
  starter_code: p.starterCode,
  open_at: p.openAt,
  updated_at: new Date().toISOString(),
});

/** 문제를 새로 만들거나(id 없음) 고친다. 같은 과목에 같은 번호가 있으면 false */
export async function saveProblem(id: number | null, p: ProblemInput): Promise<"ok" | "duplicate"> {
  const query = id === null ? db().from("problems").insert(toRow(p)) : db().from("problems").update(toRow(p)).eq("id", id);
  const { error } = await query;
  if (error?.code === "23505") return "duplicate";
  if (error) throw new Error(`문제 저장 실패: ${error.message}`);
  return "ok";
}

export async function deleteProblem(id: number) {
  const { error } = await db().from("problems").delete().eq("id", id);
  if (error) throw new Error(`문제 삭제 실패: ${error.message}`);
}
