import "server-only";
import { csvLine, kindOf, type BackupSchema } from "./backupCsv";
import { db } from "./db";
import { inClass } from "./classes";
import { OMIT_COLUMNS, schoolYearRange, statsCsv, StatCollector, YEAR_TABLES, yearTable, keyOf, type StatRow, type YearTable } from "./yearEnd";
import { zipStream, type ZipEntry } from "./zip";

/**
 * 학년도 말 정리 (관리자): 기록 수 세기, 전체 백업(ZIP 안에 표마다 CSV), 이름 없는 통계, 지우기, 백업에서 되살리기.
 * 지우는 것: 그 학년도의 학생 기록 전부 (yearEnd.ts의 YEAR_TABLES). 남는 것: 교사·관리자 계정, 수업 문제, 채점 기준, 설정, 통계.
 */

const missing = (message: string) => /(does not exist|schema cache|not find)/i.test(message);
const CHUNK = 200;
const chunks = <T,>(list: T[], size = CHUNK) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

type Row = Record<string, unknown>;

/** 학생 한 명을 지울 때처럼 모든 학년도를 볼 때 쓰는 학년도 값 */
export const ALL_YEARS = 0;

const rangeFor = (year: number, dateColumn: string) => {
  if (year === ALL_YEARS) return dateColumn === "class_date" ? { from: "2000-01-01", to: "2100-01-01" } : { from: "2000-01-01T00:00:00+09:00", to: "2100-01-01T00:00:00+09:00" };
  const r = schoolYearRange(year);
  return dateColumn === "class_date" ? { from: r.fromDate, to: r.toDate } : { from: r.from, to: r.to };
};

/**
 * 고른 범위: 그 학년도 제출·학생 문제 번호, 지울 학생 계정, 반을 골랐으면 그 반 학생들(students)과 반(cls, "class:2-3"·"prog:2-5")
 */
type Scope = {
  submissions: number[];
  problems: number[];
  users: string[];
  students: string[] | null;
  cls: string;
  /** 예전 사이트 제출(아이디 없음)을 이름으로 찾을 때 맞아야 하는 "학년-반"들 */
  legacyClasses: string[];
};

/** 학생 아이디를 담은 칸 (반을 고르면 이 칸으로 거른다) */
const USER_COL: Record<string, string> = {
  submissions: "user_id",
  ai_chats: "user_id",
  reflections: "user_id",
  practice_problems: "user_id",
  student_problems: "author_id",
};

type StudentRow = { id: string; name: string; grade: number | string | null; class: number | string | null; programming_grade: number | string | null; programming_class: number | string | null };

async function allStudents(): Promise<StudentRow[]> {
  const out: StudentRow[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db()
      .from("users")
      .select("id, name, grade, class, programming_grade, programming_class")
      .eq("role", "student")
      .order("id")
      .range(start, start + 999);
    if (error) throw new Error(`계정 조회 실패: ${error.message}`);
    out.push(...((data ?? []) as StudentRow[]));
    if ((data ?? []).length < 1000) return out;
  }
}

/**
 * 범위 만들기: 학년도(와 반, 또는 학생 한 명)의 제출·학생 문제 번호, 지울 학생 계정.
 * studentId를 주면 그 학생 한 명의 기록과 계정 (year가 ALL_YEARS면 모든 학년도)
 */
export async function buildScope(year: number, cls: string, everyStudent: boolean, studentId = ""): Promise<Scope & { classStudents: number }> {
  const students = await allStudents();
  const picked = studentId ? students.filter((s) => s.id === studentId) : cls ? students.filter((s) => inClass(s, cls)) : null;
  const legacyClasses = studentId
    ? picked!.flatMap((s) => [`${s.grade}-${s.class}`, `${s.programming_grade}-${s.programming_class}`])
    : cls
      ? [cls.split(":")[1]]
      : [];
  const base: Scope = { submissions: [], problems: [], users: [], students: picked ? picked.map((s) => s.id) : null, cls, legacyClasses };
  base.submissions = await idsOf(yearTable("submissions")!, year, base, picked);
  base.problems = await idsOf(yearTable("student_problems")!, year, base, picked);
  if (studentId) base.users = picked!.map((s) => s.id);
  else {
    const candidates = await studentsToDelete(year, everyStudent);
    base.users = picked ? candidates.filter((id) => base.students!.includes(id)) : candidates;
  }
  return { ...base, classStudents: picked ? picked.length : students.length };
}

/** 표의 그 학년도(와 반) 기록 번호들. 예전 사이트 제출(아이디 없음)은 이름과 제출할 때의 반으로 그 반 학생인지 본다 */
async function idsOf(spec: YearTable, year: number, scope: Scope, picked: StudentRow[] | null): Promise<number[]> {
  const ids: number[] = [];
  for await (const rows of rowPages(spec, year, scope, "id")) ids.push(...rows.map((r) => Number(r.id)));
  if (spec.table === "submissions" && picked?.length) {
    const allowed = new Set(scope.legacyClasses);
    const names = [...new Set(picked.map((s) => s.name))];
    const { from, to } = rangeFor(year, "submitted_at");
    for (const part of chunks(names)) {
      for (let start = 0; ; start += 1000) {
        const { data, error } = await db()
          .from("submissions")
          .select("id, grade, class")
          .is("user_id", null)
          .in("name", part)
          .gte("submitted_at", from)
          .lt("submitted_at", to)
          .order("id")
          .range(start, start + 999);
        if (error) throw new Error(`제출 조회 실패: ${error.message}`);
        for (const r of data ?? []) if (allowed.has(`${r.grade}-${r.class}`)) ids.push(Number(r.id));
        if ((data ?? []).length < 1000) break;
      }
    }
  }
  return [...new Set(ids)];
}

/** 그 학년도의 기록을 페이지마다 흘려보낸다 (표가 없으면 아무것도 없음) */
async function* rowPages(spec: YearTable, year: number, scope: Scope, columns: string): AsyncGenerator<Row[]> {
  type Q = { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
  async function* run(make: () => Q): AsyncGenerator<Row[]> {
    for (let start = 0; ; start += CHUNK) {
      const { data, error } = await make().range(start, start + CHUNK - 1);
      if (error && missing(error.message)) return;
      if (error) throw new Error(`${spec.label} 조회 실패: ${error.message}`);
      const rows = (data ?? []) as Row[];
      if (rows.length) yield rows;
      if (rows.length < CHUNK) return;
    }
  }
  const order = spec.id ? "id" : spec.key[0];
  if ("date" in spec.by) {
    const { from, to } = rangeFor(year, spec.by.date);
    const col = spec.by.date;
    // 반을 골랐으면: 제출은 이미 고른 번호로, 나머지는 그 반 학생 것만
    if (scope.students && spec.table === "submissions" && columns !== "id") {
      for (const part of chunks(scope.submissions)) yield* run(() => db().from(spec.table).select(columns).in("id", part).order(order) as unknown as Q);
      return;
    }
    if (scope.students) {
      const userCol = USER_COL[spec.table];
      for (const part of chunks(scope.students)) {
        yield* run(() => db().from(spec.table).select(columns).gte(col, from).lt(col, to).in(userCol, part).order(order) as unknown as Q);
      }
      return;
    }
    yield* run(() => db().from(spec.table).select(columns).gte(col, from).lt(col, to).order(order) as unknown as Q);
    return;
  }
  const [col, list] =
    "submission" in spec.by ? ["submission_id", scope.submissions] : "problem" in spec.by ? ["problem_id", scope.problems] : ["id", scope.users];
  for (const part of chunks<string | number>(list)) {
    yield* run(() => db().from(spec.table).select(columns).in(col, part).order(order) as unknown as Q);
  }
}

async function eachRows(spec: YearTable, year: number, scope: Scope, columns: string, onPage: (rows: Row[]) => void | Promise<void>) {
  for await (const rows of rowPages(spec, year, scope, columns)) await onPage(rows);
}

/** 지울 학생 계정: 기본은 그 학년도 기록이 있고 그 뒤 기록이 없는 학생, all이면 모든 학생 계정 */
export async function studentsToDelete(year: number, all: boolean): Promise<string[]> {
  const students = new Set<string>();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db().from("users").select("id").eq("role", "student").order("id").range(start, start + 999);
    if (error) throw new Error(`계정 조회 실패: ${error.message}`);
    for (const r of data ?? []) students.add(String(r.id));
    if ((data ?? []).length < 1000) break;
  }
  if (all) return [...students];
  const used = new Set<string>();
  const later = new Set<string>();
  const { to, toDate } = schoolYearRange(year);
  const userCols: [string, string, string][] = [
    ["submissions", "user_id", "submitted_at"],
    ["reflections", "user_id", "class_date"],
    ["ai_chats", "user_id", "created_at"],
    ["practice_problems", "user_id", "created_at"],
    ["student_problems", "author_id", "created_at"],
  ];
  for (const [table, userCol, dateCol] of userCols) {
    const { from, to: end } = rangeFor(year, dateCol);
    const collect = async (target: Set<string>, gte: string, lt?: string) => {
      for (let start = 0; ; start += 1000) {
        let q = db().from(table).select(userCol).gte(dateCol, gte);
        if (lt) q = q.lt(dateCol, lt);
        const { data, error } = await q.order(userCol).range(start, start + 999);
        if (error && missing(error.message)) return;
        if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
        for (const r of (data ?? []) as unknown as Row[]) if (r[userCol]) target.add(String(r[userCol]));
        if ((data ?? []).length < 1000) return;
      }
    };
    await collect(used, from, end);
    await collect(later, dateCol === "class_date" ? toDate : to);
  }
  return [...used].filter((id) => students.has(id) && !later.has(id));
}

/** 표마다 그 학년도(와 반) 기록 수, 지울 학생 계정 수 (표가 없으면 null) */
export async function countYear(year: number, cls = "", studentId = ""): Promise<{
  counts: { table: string; label: string; count: number | null }[];
  students: { withRecords: number; all: number };
}> {
  const [scope, every] = await Promise.all([buildScope(year, cls, false, studentId), buildScope(year, cls, true, studentId)]);
  const counts = await Promise.all(
    YEAR_TABLES.filter((t) => t.table !== "users").map(async (spec) => {
      if (spec.table === "submissions") return { table: spec.table, label: spec.label, count: scope.submissions.length };
      if (spec.table === "student_problems") return { table: spec.table, label: spec.label, count: scope.problems.length };
      if ("date" in spec.by && !scope.students) {
        const { from, to } = rangeFor(year, spec.by.date);
        const { count, error } = await db().from(spec.table).select("*", { count: "exact", head: true }).gte(spec.by.date, from).lt(spec.by.date, to);
        if (error && missing(error.message)) return { table: spec.table, label: spec.label, count: null };
        if (error) throw new Error(`${spec.label} 수 조회 실패: ${error.message}`);
        return { table: spec.table, label: spec.label, count: count ?? 0 };
      }
      let n = 0;
      let exists = false;
      for await (const rows of rowPages(spec, year, scope, spec.id ? "id" : spec.key[0])) {
        n += rows.length;
        exists = true;
      }
      if (!exists && !(await tableExists(spec.table))) return { table: spec.table, label: spec.label, count: null };
      return { table: spec.table, label: spec.label, count: n };
    }),
  );
  return { counts, students: { withRecords: scope.users.length, all: every.users.length } };
}

async function tableExists(table: string) {
  const { error } = await db().from(table).select("*", { head: true, count: "exact" }).limit(1);
  return !(error && missing(error.message));
}

/**
 * 전체 백업: ZIP 안에 표마다 CSV(엑셀로 열림) + schema.json(되살릴 때 칸 종류) + 이름 없는 통계 + 안내.
 * 학생 계정은 모든 학생 계정을 넣는다(평문 비밀번호 칸은 빼고). 조금씩 흘려보내서 커도 끊기지 않는다.
 */
export function backupZip(year: number, cls = "", studentId = ""): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const schema: BackupSchema = {};
  async function* entries(): AsyncGenerator<ZipEntry> {
    // 학생 계정은 (그 반의) 모든 학생 계정을 넣는다 (되살릴 때 이미 있는 계정은 건너뜀)
    const scope = await buildScope(year, cls, true, studentId);
    if (scope.students) scope.users = scope.students;
    for (const spec of YEAR_TABLES) {
      const kinds: Record<string, string> = {};
      schema[spec.table] = kinds as BackupSchema[string];
      const omit = new Set(OMIT_COLUMNS[spec.table] ?? []);
      async function* csv(): AsyncGenerator<Uint8Array> {
        yield enc.encode("\uFEFF");
        let head: string[] | null = null;
        for await (const rows of rowPages(spec, year, scope, "*")) {
          let text = "";
          for (const row of rows) {
            if (!head) {
              head = Object.keys(row).filter((k) => !omit.has(k));
              text += csvLine(head);
            }
            for (const k of head) {
              const kind = kindOf(row[k]);
              if (kind && !kinds[k]) kinds[k] = kind;
            }
            text += csvLine(head.map((k) => row[k]));
          }
          yield enc.encode(text);
        }
      }
      yield { name: `${spec.table}.csv`, data: csv() };
    }
    yield {
      name: "schema.json",
      data: [enc.encode(JSON.stringify({ schoolYear: year === ALL_YEARS ? null : year, cls, student: studentId || null, createdAt: new Date().toISOString(), tables: schema }, null, 1))],
    };
    // 학생 한 명 백업에는 통계를 넣지 않는다 (한 명의 숫자는 통계가 아님)
    if (!studentId) yield { name: "이름없는통계.csv", data: [enc.encode("\uFEFF" + statsCsv(await computeYearStats(year)))] };
    yield {
      name: "안내.txt",
      data: [
        enc.encode(
          [
            studentId
              ? `Line by Line 학생 한 명(${studentId})의 모든 기록 백업 (${new Date().toISOString()})`
              : `Line by Line ${year}학년도${cls ? ` ${cls.replace("class:", "").replace("prog:", "프로그래밍 ")}반` : ""} 학생 기록 백업 (${new Date().toISOString()})`,
            "",
            "- 표마다 CSV 파일 하나씩이에요. 엑셀로 열어 볼 수 있어요 (=, + 등으로 시작하는 글 앞에는 ' 가 붙어 있어요).",
            "- 이 ZIP 파일을 그대로 관리자 페이지 '백업에서 되돌리기'에 올리면 사이트에 다시 넣을 수 있어요.",
            "- 고친 파일은 되살릴 수 없어요. 원본 ZIP은 그대로 보관해 주세요.",
            "- 학생 이름·코드·성찰이 들어 있어요. 학교 규정에 맞게 보관하거나 폐기해 주세요.",
            "- 평문 비밀번호는 넣지 않았어요. 되살린 학생이 로그인하지 못하면 선생님이 비밀번호를 초기화해 주세요.",
          ].join("\r\n"),
        ),
      ],
    };
  }
  return zipStream(entries());
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
    const spec = { table, label: table, by: { date }, key: ["id"], id: true };
    await eachRows(spec, year, { submissions: [], problems: [], users: [], students: null, cls: "", legacyClasses: [] }, columns, (rows) => void out.push(...(rows as T[])));
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
export async function saveYearStats(year: number, fresh: StatRow[]): Promise<void> {
  // 이미 남긴 통계와 합친다: 반을 하나씩 지운 뒤 다시 계산해도 지운 반의 숫자가 사라지지 않게 (같은 칸은 새 값으로)
  const before = (await listYearStats()).years.find((y) => y.year === year)?.rows ?? [];
  const key = (r: StatRow) => `${r.month}|${r.subject}|${r.cls}`;
  const merged = new Map(before.map((r) => [key(r), r]));
  for (const r of fresh) merged.set(key(r), r);
  const rows = [...merged.values()].sort((a, b) => a.month.localeCompare(b.month) || a.subject.localeCompare(b.subject) || a.cls.localeCompare(b.cls, "ko", { numeric: true }));
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

/** 지우기: 그 학년도(와 반)의 학생 기록 전부 (가리키는 기록부터, 학생 계정은 마지막에). 지운 수를 돌려준다 */
export async function deleteYear(year: number, everyStudent: boolean, cls = "", studentId = ""): Promise<{ table: string; deleted: number | null }[]> {
  const scope = await buildScope(year, cls, everyStudent, studentId);
  const out: { table: string; deleted: number | null }[] = [];
  for (const spec of [...YEAR_TABLES].reverse()) {
    let deleted = 0;
    let exists = true;
    const remove = async (make: () => PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
      const { count, error } = await make();
      if (error && missing(error.message)) return void (exists = false);
      if (error) throw new Error(`${spec.label} 삭제 실패: ${error.message}`);
      deleted += count ?? 0;
    };
    if (spec.table === "submissions" || spec.table === "student_problems") {
      const ids = spec.table === "submissions" ? scope.submissions : scope.problems;
      for (const part of chunks(ids)) await remove(() => db().from(spec.table).delete({ count: "exact" }).in("id", part));
    } else if ("date" in spec.by && scope.students) {
      // 반을 골랐으면: 그 반 학생 기록의 번호를 모아 지운다
      const ids: number[] = [];
      for await (const rows of rowPages(spec, year, scope, "id")) ids.push(...rows.map((r) => Number(r.id)));
      for (const part of chunks(ids)) await remove(() => db().from(spec.table).delete({ count: "exact" }).in("id", part));
      if (!ids.length) exists = await tableExists(spec.table);
    } else if ("date" in spec.by) {
      const { from, to } = rangeFor(year, spec.by.date);
      const col = spec.by.date;
      await remove(() => db().from(spec.table).delete({ count: "exact" }).gte(col, from).lt(col, to));
    } else if ("users" in spec.by) {
      for (const part of chunks(scope.users)) await remove(() => db().from("users").delete({ count: "exact" }).in("id", part).eq("role", "student"));
    } else {
      const [col, list] = "submission" in spec.by ? ["submission_id", scope.submissions] : ["problem_id", scope.problems];
      for (const part of chunks<number>(list)) {
        await remove(() => db().from(spec.table).delete({ count: "exact" }).in(col, part));
        if (!exists) break;
      }
    }
    out.push({ table: spec.table, deleted: exists ? deleted : null });
  }
  return out;
}

/**
 * 백업에서 되살리기 (한 번에 한 표의 몇 줄씩, 브라우저가 ZIP을 읽어 나눠 보냄).
 * 이미 있는 기록(key가 같은 것)은 넣지 않고 그 번호를 돌려준다 → 두 번 올려도 겹치지 않는다.
 * rows는 브라우저가 remapRow로 참조 번호를 이미 바꾼 것. oldIds는 원래 번호 (자동 번호 표만).
 * 돌려주는 것: 원래 번호 → 지금 번호 (자동 번호 표만), 넣은 수, 이미 있던 수
 */
export async function restoreRows(
  table: string,
  rows: Row[],
  oldIds: (string | null)[],
): Promise<{ ids: [string, number][]; inserted: number; skipped: number }> {
  const spec = yearTable(table);
  if (!spec) throw new Error("모르는 표예요.");
  if (spec.table === "users") rows = rows.map((r) => ({ ...r, role: "student" })); // 학생 계정만 되살린다
  // 이미 있는 것 찾기 (첫 열쇠 칸으로 좁힌 뒤 나머지 칸까지 맞춰 봄)
  const first = spec.key[0];
  const values = [...new Set(rows.map((r) => r[first]).filter((v) => v !== null && v !== undefined))] as (string | number)[];
  const existing = new Map<string, number | null>();
  for (const part of chunks(values)) {
    const cols = [...new Set([...(spec.id ? ["id"] : []), ...spec.key])].join(", ");
    const { data, error } = await db().from(spec.table).select(cols).in(first, part);
    if (error) throw new Error(`${spec.label} 확인 실패: ${error.message}`);
    for (const r of (data ?? []) as unknown as Row[]) existing.set(keyOf(spec, normalize(r)), spec.id ? Number(r.id) : null);
  }
  const ids: [string, number][] = [];
  const fresh: { row: Row; old: string | null }[] = [];
  rows.forEach((row, i) => {
    const hit = existing.get(keyOf(spec, normalize(row)));
    if (hit !== undefined) {
      if (spec.id && oldIds[i] !== null && hit !== null) ids.push([oldIds[i]!, hit]);
    } else fresh.push({ row, old: oldIds[i] ?? null });
  });
  if (fresh.length) {
    const { data, error } = await db()
      .from(spec.table)
      .insert(fresh.map((f) => f.row))
      .select(spec.id ? "id" : spec.key[0]);
    if (error) throw new Error(`${spec.label} 넣기 실패: ${error.message}`);
    if (spec.id) ((data ?? []) as unknown as Row[]).forEach((r, i) => fresh[i].old !== null && ids.push([fresh[i].old!, Number(r.id)]));
  }
  return { ids, inserted: fresh.length, skipped: rows.length - fresh.length };
}

/** 열쇠 비교용: 날짜는 같은 순간이면 같은 글로 (DB가 돌려주는 모양과 백업의 모양이 조금 다를 수 있음) */
function normalize(r: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) {
    out[k] = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : v;
  }
  return out;
}
