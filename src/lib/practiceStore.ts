import "server-only";
import { kstDayStart, type Usage } from "./aiChat";
import { db, fetchAll, type RangeQuery } from "./db";
import {
  defaultSettings,
  normalizeSettings,
  type PracticeDraft,
  type PracticeForTeacher,
  type PracticeProblem,
  type PracticeSettings,
  type PracticeSource,
  type PracticeTest,
} from "./practice";

type Row = {
  id: number;
  user_id: string;
  subject: string;
  source: string;
  concept: string;
  level: number;
  basis: string;
  title: string;
  description: string;
  conditions: unknown;
  starter_code: string;
  tests: unknown;
  solution: string;
  code: string | null;
  init_code: string | null;
  edit_log: unknown;
  passed: number | null;
  checks: number | null;
  solved_at: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  flagged_by: string | null;
  created_at: string;
};

const tests = (v: unknown): PracticeTest[] =>
  Array.isArray(v)
    ? v.map((t) => ({
        inputs: Array.isArray(t?.inputs) ? t.inputs.map(String) : [],
        output: String(t?.output ?? ""),
      }))
    : [];

const fromRow = (r: Row): PracticeForTeacher => ({
  id: Number(r.id),
  userId: r.user_id,
  subject: r.subject,
  source: r.source === "stuck" ? "stuck" : "concept",
  concept: r.concept ?? "",
  level: Number(r.level) || 2,
  basis: r.basis ?? "",
  title: r.title,
  description: r.description,
  conditions: Array.isArray(r.conditions) ? r.conditions.map(String) : [],
  starterCode: r.starter_code ?? "",
  tests: tests(r.tests),
  solution: r.solution ?? "",
  code: r.code,
  initCode: r.init_code,
  log: r.edit_log,
  passed: r.passed === null ? null : Number(r.passed),
  checks: Number(r.checks ?? 0),
  solvedAt: r.solved_at,
  flaggedBy: r.flagged_by === "student" || r.flagged_by === "teacher" ? r.flagged_by : null,
  createdAt: r.created_at,
  model: r.model,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
});

/** 학생에게 보낼 때: 참고 답안을 뺀다 */
export function forStudent(p: PracticeForTeacher): PracticeProblem {
  const copy: Partial<PracticeForTeacher> = { ...p };
  delete copy.solution;
  return copy as PracticeProblem;
}

/** 표가 없어서(015 실행 전) 생긴 오류인지 */
const tableMissing = (message: string) =>
  /practice_(problems|settings)/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

export class PracticeNotReadyError extends Error {}

function check(error: { message: string } | null, what: string) {
  if (!error) return;
  if (tableMissing(error.message)) throw new PracticeNotReadyError(error.message);
  throw new Error(`${what}: ${error.message}`);
}

/* ───────── 교사 설정 ───────── */

/** 과목들의 연습 모드 설정 (저장된 것이 없으면 기본값: 켬, 모든 개념). 표가 없으면 ready=false */
export async function getPracticeSettings(subjects: string[]): Promise<{ ready: boolean; settings: PracticeSettings[] }> {
  const { data, error } = await db().from("practice_settings").select("*").in("subject", subjects);
  if (error && tableMissing(error.message)) return { ready: false, settings: subjects.map(defaultSettings) };
  check(error, "연습 모드 설정 조회 실패");
  const saved = new Map((data ?? []).map((r) => [String(r.subject), normalizeSettings(r, String(r.subject))]));
  return { ready: true, settings: subjects.map((s) => saved.get(s) ?? defaultSettings(s)) };
}

export async function savePracticeSettings(s: PracticeSettings): Promise<void> {
  const { error } = await db()
    .from("practice_settings")
    .upsert({ subject: s.subject, enabled: s.enabled, concepts: s.concepts, note: s.note, updated_at: new Date().toISOString() });
  check(error, "연습 모드 설정 저장 실패");
}

/* ───────── 연습 문제 ───────── */

/** 오늘(한국 시간) 이 학생이 만든 연습 문제 수 */
export async function countTodayPractice(userId: string): Promise<number> {
  const { count, error } = await db()
    .from("practice_problems")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", kstDayStart());
  check(error, "연습 문제 수 조회 실패");
  return count ?? 0;
}

/** 내 연습 문제 (최근 것부터, 작성 기록은 빼고) */
export async function listMyPractice(userId: string): Promise<PracticeProblem[]> {
  const rows = await fetchAll<Row>(
    () =>
      db()
        .from("practice_problems")
        .select(
          "id, user_id, subject, source, concept, level, basis, title, description, conditions, starter_code, tests, passed, checks, solved_at, flagged_by, created_at, model, input_tokens, output_tokens",
        )
        .eq("user_id", userId)
        .order("id", { ascending: false }) as unknown as RangeQuery<Row>,
  ).catch((err) => {
    check({ message: String((err as Error)?.message ?? err) }, "연습 문제 조회 실패");
    throw err;
  });
  return rows.map((r) => forStudent(fromRow({ ...r, solution: "", code: null, init_code: null, edit_log: null })));
}

/** 연습 문제 하나 (onlyUserId를 주면 그 학생 것만). 참고 답안 포함이므로 학생에게 보낼 때는 forStudent로 */
export async function getPractice(id: number, onlyUserId?: string): Promise<PracticeForTeacher | null> {
  let query = db().from("practice_problems").select("*").eq("id", id);
  if (onlyUserId) query = query.eq("user_id", onlyUserId);
  const { data, error } = await query.maybeSingle<Row>();
  check(error, "연습 문제 조회 실패");
  return data ? fromRow(data) : null;
}

/** 이 학생이 최근에 받은 연습 문제 제목 (같은 문제를 또 만들지 않게 AI에 알려 줌) */
export async function recentTitles(userId: string, subject: string): Promise<string[]> {
  const { data, error } = await db()
    .from("practice_problems")
    .select("title")
    .eq("user_id", userId)
    .eq("subject", subject)
    .order("id", { ascending: false })
    .limit(10);
  check(error, "연습 문제 조회 실패");
  return (data ?? []).map((r) => String(r.title));
}

export async function insertPractice(row: {
  userId: string;
  subject: string;
  source: PracticeSource;
  concept: string;
  level: number;
  basis: string;
  draft: PracticeDraft;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<PracticeProblem> {
  const { data, error } = await db()
    .from("practice_problems")
    .insert({
      user_id: row.userId,
      subject: row.subject,
      source: row.source,
      concept: row.concept,
      level: row.level,
      basis: row.basis,
      title: row.draft.title,
      description: row.draft.description,
      conditions: row.draft.conditions,
      starter_code: row.draft.starterCode,
      tests: row.draft.tests,
      solution: row.draft.solution,
      model: row.model,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
    })
    .select("*")
    .single<Row>();
  check(error, "연습 문제 저장 실패");
  return forStudent(fromRow(data!));
}

/** 확인할 때마다 지금 코드·작성 기록·통과 수를 저장한다 (처음 모두 통과한 시각은 남겨 둔다) */
export async function savePracticeWork(
  id: number,
  userId: string,
  work: { code: string; init: string; log: unknown; passed: number; total: number },
): Promise<{ solvedAt: string | null; checks: number } | null> {
  const current = await getPractice(id, userId);
  if (!current) return null;
  const now = new Date().toISOString();
  const solvedAt = current.solvedAt ?? (work.passed === work.total ? now : null);
  const checks = current.checks + 1;
  const { data, error } = await db()
    .from("practice_problems")
    .update({ code: work.code, init_code: work.init, edit_log: work.log, passed: work.passed, checks, solved_at: solvedAt, updated_at: now })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  check(error, "연습 기록 저장 실패");
  return (data ?? []).length ? { solvedAt, checks } : null;
}

export async function setPracticeFlag(id: number, by: "student" | "teacher" | null, onlyUserId?: string): Promise<boolean> {
  let query = db()
    .from("practice_problems")
    .update({
      flagged_by: by,
      flag_note: by === "student" ? "학생이 이상한 문제라고 알림" : by ? "교사가 표시함" : null,
      flagged_at: by ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (onlyUserId) query = query.eq("user_id", onlyUserId);
  const { data, error } = await query.select("id");
  check(error, "연습 문제 표시 실패");
  return (data ?? []).length > 0;
}

/** 교사용: 기간 안의 모든 연습 문제 (최근 것부터, 참고 답안 포함). 표가 없으면 ready=false */
export async function listPracticeSince(since: string): Promise<{ ready: boolean; items: PracticeForTeacher[] }> {
  try {
    const rows = await fetchAll<Row>(
      () =>
        db()
          .from("practice_problems")
          .select("*")
          .gte("created_at", since)
          .order("id", { ascending: false }) as unknown as RangeQuery<Row>,
      200,
    );
    return { ready: true, items: rows.map(fromRow) };
  } catch (err) {
    if (tableMissing(String((err as Error)?.message ?? err))) return { ready: false, items: [] };
    throw err;
  }
}

/** 사용량 카드용: 기간 안의 연습 문제 만들기 (표가 없으면 빈 목록) */
export async function practiceUsageSince(since: string): Promise<(Usage & { createdAt: string })[]> {
  try {
    const rows = await fetchAll<Pick<Row, "id" | "model" | "input_tokens" | "output_tokens" | "created_at">>(
      () =>
        db()
          .from("practice_problems")
          .select("id, model, input_tokens, output_tokens, created_at")
          .gte("created_at", since)
          .order("id") as unknown as RangeQuery<Pick<Row, "id" | "model" | "input_tokens" | "output_tokens" | "created_at">>,
    );
    return rows.map((r) => ({ model: r.model, inputTokens: r.input_tokens, outputTokens: r.output_tokens, createdAt: r.created_at }));
  } catch (err) {
    if (tableMissing(String((err as Error)?.message ?? err))) return [];
    throw err;
  }
}
