import "server-only";
import { db } from "./db";
import { CLEANUP_TABLES, schoolYearRange, StatCollector, type CleanupTable, type StatRow } from "./yearEnd";

/**
 * 학년도 말 정리 (관리자): 지울 기록 수 세기, 백업 내려받기, 이름 없는 통계 남기기, 지우기.
 * 제출(submissions)·채점(submission_scores)·연습 문제·학생이 만든 문제·계정·문제·설정은 건드리지 않는다.
 */

const missing = (message: string) => /(does not exist|schema cache|not find)/i.test(message);

const rangeFor = (year: number, dateColumn: string) => {
  const r = schoolYearRange(year);
  return dateColumn === "class_date" ? { from: r.fromDate, to: r.toDate } : { from: r.from, to: r.to };
};

/** 표마다 그 학년도 기록 수 (표가 없으면 null) */
export async function countYear(year: number): Promise<{ table: CleanupTable; label: string; count: number | null }[]> {
  return Promise.all(
    CLEANUP_TABLES.map(async ({ table, date, label }) => {
      const { from, to } = rangeFor(year, date);
      const { count, error } = await db().from(table).select("*", { count: "exact", head: true }).gte(date, from).lt(date, to);
      if (error && missing(error.message)) return { table, label, count: null };
      if (error) throw new Error(`${label} 수 조회 실패: ${error.message}`);
      return { table, label, count: count ?? 0 };
    }),
  );
}

/** 한 표의 그 학년도 기록을 페이지마다 (백업·통계용). 표가 없으면 아무것도 안 함 */
async function eachPage(table: string, dateColumn: string, year: number, columns: string, onPage: (rows: Record<string, unknown>[]) => void | Promise<void>, size = 200) {
  const { from, to } = rangeFor(year, dateColumn);
  for (let start = 0; ; start += size) {
    const { data, error } = await db()
      .from(table)
      .select(columns)
      .gte(dateColumn, from)
      .lt(dateColumn, to)
      .order(table === "replay_views" ? "watched_at" : "id")
      .range(start, start + size - 1);
    if (error && missing(error.message)) return;
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    await onPage(rows);
    if (rows.length < size) return;
  }
}

/** 백업: 지울 표들의 그 학년도 기록 전체를 JSON으로 조금씩 흘려보낸다 (큰 응답도 끊기지 않게) */
export function backupStream(year: number): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(enc.encode(`{"schoolYear":${year},"createdAt":${JSON.stringify(new Date().toISOString())},"tables":{`));
        let firstTable = true;
        for (const { table, date } of CLEANUP_TABLES) {
          controller.enqueue(enc.encode(`${firstTable ? "" : ","}${JSON.stringify(table)}:[`));
          firstTable = false;
          let first = true;
          await eachPage(table, date, year, "*", (rows) => {
            for (const r of rows) {
              controller.enqueue(enc.encode(`${first ? "" : ","}${JSON.stringify(r)}`));
              first = false;
            }
          });
          controller.enqueue(enc.encode("]"));
        }
        controller.enqueue(enc.encode("}}"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/** 이름 없는 통계 계산 (제출은 100건씩 읽어 숫자로만 바꾸고 버림) */
export async function computeYearStats(year: number): Promise<StatRow[]> {
  const c = new StatCollector();
  const r = schoolYearRange(year);
  for (let start = 0; ; start += 100) {
    const { data, error } = await db()
      .from("submissions")
      .select("id, subject, grade, class, name, submitted_at, init_code, edit_log")
      .gte("submitted_at", r.from)
      .lt("submitted_at", r.to)
      .order("id")
      .range(start, start + 99);
    if (error) throw new Error(`제출 조회 실패: ${error.message}`);
    const rows = (data ?? []) as { subject: string; grade: number | string | null; class: number | string | null; name: string; submitted_at: string; init_code: string | null; edit_log: unknown }[];
    // 학생 구분은 이름+반으로만 세고 결과에는 담지 않는다
    c.addSubmissions(rows.map((s) => ({ ...s, who: `${s.name}|${s.grade}|${s.class}` })));
    if (rows.length < 100) break;
  }
  const collect = async <T,>(table: string, date: string, columns: string) => {
    const out: T[] = [];
    await eachPage(table, date, year, columns, (rows) => void out.push(...(rows as T[])), 1000);
    return out;
  };
  const [reflections, chats, reviews, practice, studentProblems, users] = await Promise.all([
    collect<{ subject: string; grade: string | null; class: string | null; user_id: string; class_date: string }>("reflections", "class_date", "id, subject, grade, class, user_id, class_date"),
    collect<{ user_id: string; subject: string; created_at: string }>("ai_chats", "created_at", "id, user_id, subject, created_at"),
    collect<{ user_id: string; subject: string; created_at: string }>("ai_reviews", "created_at", "id, user_id, subject, created_at"),
    collect<{ user_id: string; subject: string; created_at: string; solved_at: string | null }>("practice_problems", "created_at", "id, user_id, subject, created_at, solved_at"),
    collect<{ author_id: string; subject: string; created_at: string; status: string }>("student_problems", "created_at", "id, author_id, subject, created_at, status"),
    allUserClasses(),
  ]);
  c.addOthers({ reflections, chats, reviews, practice, studentProblems, users });
  return c.result();
}

async function allUserClasses() {
  const map = new Map<string, { grade: number | string | null; class: number | string | null; programming_grade: number | string | null; programming_class: number | string | null }>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db()
      .from("users")
      .select("id, grade, class, programming_grade, programming_class")
      .order("id")
      .range(start, start + 999);
    if (error) throw new Error(`계정 조회 실패: ${error.message}`);
    for (const u of data ?? []) map.set(String(u.id), u);
    if ((data ?? []).length < 1000) break;
  }
  return map;
}

/* ───────── 남겨 두는 통계 (year_stats) ───────── */

export class YearStatsNotReadyError extends Error {}

/** 통계를 사이트에 남긴다 (같은 학년도는 새로 계산한 것으로 바꿈) */
export async function saveYearStats(year: number, rows: StatRow[]): Promise<void> {
  const { error } = await db().from("year_stats").upsert({ school_year: year, rows, created_at: new Date().toISOString() });
  if (error && /year_stats/.test(error.message) && missing(error.message)) throw new YearStatsNotReadyError(error.message);
  if (error) throw new Error(`통계 저장 실패: ${error.message}`);
}

/** 남겨 둔 통계들 (표가 없으면 ready=false) */
export async function listYearStats(): Promise<{ ready: boolean; years: { year: number; createdAt: string; rows: StatRow[] }[] }> {
  const { data, error } = await db().from("year_stats").select("*").order("school_year", { ascending: false });
  if (error && /year_stats/.test(error.message) && missing(error.message)) return { ready: false, years: [] };
  if (error) throw new Error(`통계 조회 실패: ${error.message}`);
  return {
    ready: true,
    years: (data ?? []).map((r) => ({ year: Number(r.school_year), createdAt: String(r.created_at), rows: Array.isArray(r.rows) ? (r.rows as StatRow[]) : [] })),
  };
}

/** 지우기: 정해 둔 표에서 그 학년도 기록만. 지운 수를 돌려준다 */
export async function deleteYear(year: number): Promise<{ table: string; deleted: number | null }[]> {
  const out: { table: string; deleted: number | null }[] = [];
  for (const { table, date } of CLEANUP_TABLES) {
    const { from, to } = rangeFor(year, date);
    const { count, error } = await db().from(table).delete({ count: "exact" }).gte(date, from).lt(date, to);
    if (error && missing(error.message)) {
      out.push({ table, deleted: null });
      continue;
    }
    if (error) throw new Error(`${table} 삭제 실패: ${error.message}`);
    out.push({ table, deleted: count ?? 0 });
  }
  return out;
}
