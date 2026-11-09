/**
 * 학년도 말 정리: 학년도 기간, 지우는 표, 이름 없는 통계 계산. 순수 함수만 (DB는 yearEndStore.ts). 단위 테스트: yearEnd.test.ts
 *
 * 정한 것 (2026-11):
 * - 학년도 = 3월 1일 ~ 다음 해 2월 말 (한국 시간). 보관 기간은 다음 해 2월 말까지, 필요하면 그 전에도 지울 수 있다(경고)
 * - 학년도가 끝나면 **학생 기록을 모두 지운다**: 제출·점수·피드백, 학생 계정, AI 대화·되돌아보기, 성찰, 메모, 연습 문제, 학생이 만든 문제
 * - 남는 것: 교사·관리자 계정, 수업 문제, 채점 기준, 설정, 이름 없는 통계(year_stats)
 * - 지우기 전에 전체를 CSV 묶음(ZIP)으로 받고, 그 파일로 되돌리거나(다시 넣기) 지난 기록을 다시 볼 수 있다
 * - 제출·계정은 v1과 함께 쓰는 표이므로, v1을 읽기 전용으로 돌린 뒤(3월 전환 뒤)에 지운다
 */
import { countFixedErrors, kstDate } from "./journey";
import { gradeClassFor } from "./problems";
import { analyzeLog } from "./replay";

/**
 * 학년도 정리에 들어가는 표. 순서 = 되살리는 순서 (지울 때는 거꾸로).
 * by: 그 학년도 기록을 고르는 법 / id: 자동 번호 칸(되살릴 때 새 번호를 받고 다른 표의 참조를 바꿈)
 * key: 되살릴 때 이미 있는지 보는 칸들 (두 번 올려도 겹치지 않게) / refs: 다른 표의 번호를 가리키는 칸
 */
export type YearTable = {
  table: string;
  label: string;
  by: { date: string } | { submission: true } | { problem: true } | { users: true };
  id?: boolean;
  key: string[];
  refs?: Record<string, string>;
};

export const YEAR_TABLES: YearTable[] = [
  { table: "users", label: "학생 계정", by: { users: true }, key: ["id"] },
  { table: "submissions", label: "제출 (코드·작성 기록·점수·피드백)", by: { date: "submitted_at" }, id: true, key: ["name", "submitted_at", "problem"] },
  { table: "submission_scores", label: "영역별 점수 (채점 기준 사본)", by: { submission: true }, key: ["submission_id"], refs: { submission_id: "submissions" } },
  { table: "grading_drafts", label: "AI 채점 초안", by: { submission: true }, id: true, key: ["submission_id", "created_at"], refs: { submission_id: "submissions" } },
  { table: "ai_reviews", label: "AI 되돌아보기", by: { submission: true }, id: true, key: ["submission_id"], refs: { submission_id: "submissions" } },
  { table: "timeline_notes", label: "타임라인 메모·피드백", by: { submission: true }, id: true, key: ["submission_id", "user_id", "created_at"], refs: { submission_id: "submissions" } },
  { table: "replay_views", label: "재생을 끝까지 본 기록", by: { submission: true }, key: ["user_id", "submission_id"], refs: { submission_id: "submissions" } },
  { table: "practice_problems", label: "연습 문제와 푼 기록", by: { date: "created_at" }, id: true, key: ["user_id", "created_at"] },
  { table: "student_problems", label: "학생이 만든 문제", by: { date: "created_at" }, id: true, key: ["author_id", "created_at"] },
  { table: "student_problem_attempts", label: "학생이 만든 문제를 푼 기록", by: { problem: true }, id: true, key: ["problem_id", "user_id"], refs: { problem_id: "student_problems" } },
  { table: "ai_chats", label: "AI 도우미 대화", by: { date: "created_at" }, id: true, key: ["user_id", "created_at"] },
  { table: "reflections", label: "오늘의 성찰", by: { date: "class_date" }, id: true, key: ["user_id", "subject", "class_date"] },
];

export const yearTable = (name: string) => YEAR_TABLES.find((t) => t.table === name);

/** 백업에 넣지 않는 칸 (예전 사이트의 평문 비밀번호) */
export const OMIT_COLUMNS: Record<string, string[]> = { users: ["password"] };

/**
 * 되살릴 때: 자동 번호를 새 번호로 바꾼다. maps: 표 → (예전 번호 → 새 번호)
 * AI 대화의 problem "P12"(연습 문제)·"S7"(학생이 만든 문제)도 새 번호로 바꾼다
 */
export function remapRow(spec: YearTable, row: Record<string, unknown>, maps: Record<string, Map<string, number>>): Record<string, unknown> | null {
  const out: Record<string, unknown> = { ...row };
  if (spec.id) delete out.id;
  for (const [col, target] of Object.entries(spec.refs ?? {})) {
    const next = maps[target]?.get(String(row[col]));
    if (next === undefined) return null; // 가리키는 기록이 백업에 없으면 넣지 않는다
    out[col] = next;
  }
  if (spec.table === "ai_chats" && typeof row.problem === "string") {
    const m = /^([PS])(\d+)$/.exec(row.problem);
    if (m) {
      const next = maps[m[1] === "P" ? "practice_problems" : "student_problems"]?.get(m[2]);
      if (next !== undefined) out.problem = `${m[1]}${next}`;
    }
  }
  return out;
}

/** 되살릴 때 "같은 기록"인지 보는 열쇠 */
export const keyOf = (spec: YearTable, row: Record<string, unknown>) => spec.key.map((k) => String(row[k] ?? "")).join("\u0001");

/** 학년도 기간 (한국 시간): 그해 3월 1일 0시 ~ 다음 해 3월 1일 0시 전 */
export function schoolYearRange(year: number): { from: string; to: string; fromDate: string; toDate: string } {
  return {
    from: `${year}-03-01T00:00:00+09:00`,
    to: `${year + 1}-03-01T00:00:00+09:00`,
    fromDate: `${year}-03-01`,
    toDate: `${year + 1}-03-01`,
  };
}

/** 이 날짜(시각)가 속한 학년도 (1~2월은 지난해 학년도) */
export function schoolYearOf(when: string | Date): number {
  const [y, m] = kstDate(when).split("-").map(Number);
  return m >= 3 ? y : y - 1;
}

/** 이 학년도가 끝났는지 (다음 해 3월 1일부터) — 끝나기 전(보관 기간)에도 지울 수는 있지만 화면에서 경고한다 */
export const canClean = (year: number, now = new Date()) => now >= new Date(schoolYearRange(year).to);

/** 삭제 확인 문구 (관리자가 그대로 입력해야 지워짐) */
export const confirmPhrase = (year: number, cls = "") => `${year}학년도${cls ? ` ${classLabel(cls)}` : ""} 삭제`;

/** 반 고르기 값 → 보이는 이름 ("class:2-3" → "2-3반", "prog:2-5" → "프로그래밍 2-5반") */
export const classLabel = (cls: string) => {
  const [kind, value] = cls.split(":");
  return value ? `${kind === "prog" ? "프로그래밍 " : ""}${value}반` : "";
};

/* ───────── 이름 없는 통계 ───────── */

/** 통계 한 줄: 월 × 과목 × 반 (반이 없으면 "반 없음"). 이름·아이디는 담지 않는다 */
export type StatRow = {
  month: string;
  subject: string;
  cls: string;
  submissions: number;
  submitStudents: number;
  loggedSubmissions: number;
  typedChars: number;
  pastedChars: number;
  runs: number;
  runErrors: number;
  fixedErrors: number;
  activeMinutes: number;
  reflections: number;
  reflectStudents: number;
  aiQuestions: number;
  aiReviews: number;
  practiceMade: number;
  practiceSolved: number;
  studentProblems: number;
  studentProblemsApproved: number;
};

type ClassInfo = { grade: number | string | null; class: number | string | null; programming_grade: number | string | null; programming_class: number | string | null };

export type StatInput = {
  submissions: { subject: string; grade: number | string | null; class: number | string | null; who: string; submitted_at: string; init_code: string | null; edit_log: unknown }[];
  reflections: { subject: string; grade: string | null; class: string | null; user_id: string; class_date: string }[];
  /** 아이디 → 반 (AI 대화처럼 반이 없는 기록을 반으로 묶을 때) */
  users: Map<string, ClassInfo>;
  chats: { user_id: string; subject: string; created_at: string }[];
  reviews: { user_id: string; subject: string; created_at: string }[];
  practice: { user_id: string; subject: string; created_at: string; solved_at: string | null }[];
  studentProblems: { author_id: string; subject: string; created_at: string; status: string }[];
};

const clsOf = (grade: unknown, cls: unknown) => (grade === null || grade === undefined || grade === "" || cls === null || cls === undefined || cls === "" ? "반 없음" : `${grade}-${cls}`);
const monthOf = (when: string) => kstDate(when).slice(0, 7);

const EMPTY = (month: string, subject: string, cls: string): StatRow => ({
  month,
  subject,
  cls,
  submissions: 0,
  submitStudents: 0,
  loggedSubmissions: 0,
  typedChars: 0,
  pastedChars: 0,
  runs: 0,
  runErrors: 0,
  fixedErrors: 0,
  activeMinutes: 0,
  reflections: 0,
  reflectStudents: 0,
  aiQuestions: 0,
  aiReviews: 0,
  practiceMade: 0,
  practiceSolved: 0,
  studentProblems: 0,
  studentProblemsApproved: 0,
});

/** 통계 모으기 (제출은 페이지마다 나눠 넣을 수 있게 따로) */
export class StatCollector {
  private rows = new Map<string, StatRow>();
  private students = new Map<string, Set<string>>();
  private reflectors = new Map<string, Set<string>>();

  private row(when: string, subject: string, cls: string) {
    const month = monthOf(when);
    const key = `${month}|${subject}|${cls}`;
    let r = this.rows.get(key);
    if (!r) this.rows.set(key, (r = EMPTY(month, subject, cls)));
    return { r, key };
  }

  private userCls(users: Map<string, ClassInfo>, id: string, subject: string) {
    const u = users.get(id);
    if (!u) return "반 없음";
    const gc = gradeClassFor(u, subject);
    return clsOf(gc.grade, gc.class);
  }

  /** 제출 몇 개 (작성 기록은 여기서 숫자로만 바꾸고 버린다) */
  addSubmissions(list: StatInput["submissions"]) {
    for (const s of list) {
      const { r, key } = this.row(s.submitted_at, s.subject, clsOf(s.grade, s.class));
      r.submissions++;
      (this.students.get(key) ?? this.students.set(key, new Set()).get(key)!).add(s.who);
      const { edits, stats } = analyzeLog(s.init_code ?? "", s.edit_log);
      if (!edits.length) continue;
      r.loggedSubmissions++;
      r.typedChars += stats.typedChars;
      r.pastedChars += stats.pastedChars;
      r.runs += stats.runCount;
      r.runErrors += stats.runErrorCount;
      r.fixedErrors += countFixedErrors(s.edit_log);
      r.activeMinutes += stats.activeMs / 60_000;
    }
  }

  addOthers(input: Omit<StatInput, "submissions">) {
    for (const x of input.reflections) {
      const { r, key } = this.row(`${x.class_date}T12:00:00+09:00`, x.subject, clsOf(x.grade, x.class));
      r.reflections++;
      (this.reflectors.get(key) ?? this.reflectors.set(key, new Set()).get(key)!).add(x.user_id);
    }
    for (const x of input.chats) this.row(x.created_at, x.subject, this.userCls(input.users, x.user_id, x.subject)).r.aiQuestions++;
    for (const x of input.reviews) this.row(x.created_at, x.subject, this.userCls(input.users, x.user_id, x.subject)).r.aiReviews++;
    for (const x of input.practice) {
      const { r } = this.row(x.created_at, x.subject, this.userCls(input.users, x.user_id, x.subject));
      r.practiceMade++;
      if (x.solved_at) r.practiceSolved++;
    }
    for (const x of input.studentProblems) {
      const { r } = this.row(x.created_at, x.subject, this.userCls(input.users, x.author_id, x.subject));
      r.studentProblems++;
      if (x.status === "approved") r.studentProblemsApproved++;
    }
  }

  /** 월 → 과목 → 반 순서. 학생 수는 같은 칸 안에서 서로 다른 학생 수 */
  result(): StatRow[] {
    return [...this.rows.entries()]
      .map(([key, r]) => ({
        ...r,
        submitStudents: this.students.get(key)?.size ?? 0,
        reflectStudents: this.reflectors.get(key)?.size ?? 0,
        activeMinutes: Math.round(r.activeMinutes),
      }))
      .sort((a, b) => a.month.localeCompare(b.month) || a.subject.localeCompare(b.subject) || a.cls.localeCompare(b.cls, "ko", { numeric: true }));
  }
}

export function yearStats(input: StatInput): StatRow[] {
  const c = new StatCollector();
  c.addSubmissions(input.submissions);
  c.addOthers(input);
  return c.result();
}

const HEAD: [keyof StatRow, string][] = [
  ["month", "월"],
  ["subject", "과목"],
  ["cls", "반"],
  ["submissions", "제출 수"],
  ["submitStudents", "제출한 학생 수"],
  ["loggedSubmissions", "작성 기록이 있는 제출"],
  ["typedChars", "직접 입력 글자"],
  ["pastedChars", "붙여넣은 글자"],
  ["runs", "실행 수"],
  ["runErrors", "오류 실행 수"],
  ["fixedErrors", "스스로 고친 오류"],
  ["activeMinutes", "실제 작업 시간(분)"],
  ["reflections", "오늘의 성찰 수"],
  ["reflectStudents", "성찰 쓴 학생 수"],
  ["aiQuestions", "AI 도우미 질문"],
  ["aiReviews", "AI 되돌아보기"],
  ["practiceMade", "연습 문제 만든 수"],
  ["practiceSolved", "연습 문제 통과"],
  ["studentProblems", "학생이 만든 문제"],
  ["studentProblemsApproved", "그중 반 친구에게 공개"],
];

/** 엑셀에서 바로 여는 CSV (한글 깨짐 방지 BOM은 내려받을 때 붙인다). 직접 작성 비율 칸을 더한다 */
export function statsCsv(rows: StatRow[]): string {
  const head = [...HEAD.map(([, h]) => h), "직접 작성 비율(%)"];
  const lines = rows.map((r) => {
    const typed = r.typedChars + r.pastedChars ? Math.round((r.typedChars / (r.typedChars + r.pastedChars)) * 100) : "";
    return [...HEAD.map(([k]) => String(r[k])), String(typed)];
  });
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [head, ...lines].map((l) => l.map(esc).join(",")).join("\r\n");
}
