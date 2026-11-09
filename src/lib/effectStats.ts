/**
 * 📈 수업 효과(이름 없는 통계) 화면의 계산. 학년도 말 정리 통계와 같은 행(월 × 과목 × 반, `yearEnd.ts`의 StatRow)을
 * 과목·반으로 골라 월별로 합치고, 비율을 만들고, 새 사이트 도입 전후를 비교한다. 이름·아이디는 다루지 않는다.
 * 단위 테스트: effectStats.test.ts
 */
import type { StatRow } from "./yearEnd";

type Sums = Omit<StatRow, "month" | "subject" | "cls">;

const KEYS: (keyof Sums)[] = [
  "submissions",
  "submitStudents",
  "loggedSubmissions",
  "typedChars",
  "pastedChars",
  "runs",
  "runErrors",
  "fixedErrors",
  "activeMinutes",
  "reflections",
  "reflectStudents",
  "aiQuestions",
  "aiReviews",
  "practiceMade",
  "practiceSolved",
  "studentProblems",
  "studentProblemsApproved",
];

const zero = (): Sums => Object.fromEntries(KEYS.map((k) => [k, 0])) as Sums;

function add(into: Sums, r: Sums) {
  for (const k of KEYS) into[k] += Number(r[k]) || 0;
}

/** 합계에서 보고서에 쓸 비율 (나눌 것이 없으면 null) */
export type Ratios = {
  /** 직접 입력 ÷ (직접 입력 + 붙여넣기), % */
  typedPct: number | null;
  /** 오류 뒤 다시 실행해 성공한 횟수, 작성 기록이 있는 제출 하나당 */
  fixedPer: number | null;
  /** 성찰 쓴 학생 ÷ 제출한 학생, % (100을 넘지 않게). 성찰은 새 사이트 기능이라 새 사이트 기록(실행 기록)이 없으면 null */
  reflectPct: number | null;
  /** 실제 작업 시간(분), 작성 기록이 있는 제출 하나당 */
  minutesPer: number | null;
};

const round1 = (x: number) => Math.round(x * 10) / 10;

export function ratios(t: Sums): Ratios {
  const chars = t.typedChars + t.pastedChars;
  return {
    typedPct: chars ? round1((t.typedChars / chars) * 100) : null,
    fixedPer: t.loggedSubmissions && t.runs ? round1(t.fixedErrors / t.loggedSubmissions) : null,
    reflectPct: t.submitStudents && t.runs ? round1(Math.min(100, (t.reflectStudents / t.submitStudents) * 100)) : null,
    minutesPer: t.loggedSubmissions ? round1(t.activeMinutes / t.loggedSubmissions) : null,
  };
}

export type MonthPoint = Sums & Ratios & { month: string };

/** 과목·반("" = 모두)으로 고른 행을 월별로 합친다. 학생 수는 반·과목별 수의 합(한 학생이 두 과목이면 두 번) */
export function monthlySeries(rows: StatRow[], subject = "", cls = ""): MonthPoint[] {
  const byMonth = new Map<string, Sums>();
  for (const r of rows) {
    if ((subject && r.subject !== subject) || (cls && r.cls !== cls)) continue;
    const m = byMonth.get(r.month) ?? byMonth.set(r.month, zero()).get(r.month)!;
    add(m, r);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, s]) => ({ month, ...s, ...ratios(s) }));
}

/** 새 사이트(실행 기록이 남는 기록)를 처음 쓴 달 — 예전 사이트 기록에는 실행 기록이 없다 */
export function introMonth(points: MonthPoint[]): string | null {
  return points.find((p) => p.runs > 0)?.month ?? null;
}

export type Period = Sums & Ratios & { months: number };

function period(points: MonthPoint[]): Period {
  const s = zero();
  for (const p of points) add(s, p);
  return { ...s, ...ratios(s), months: points.length };
}

/** 도입 전(그 달 전)과 뒤(그 달부터)를 비교. 도입 시점이 없으면 모두 "뒤" */
export function beforeAfter(points: MonthPoint[], intro: string | null): { before: Period; after: Period } {
  if (!intro) return { before: period([]), after: period(points) };
  return { before: period(points.filter((p) => p.month < intro)), after: period(points.filter((p) => p.month >= intro)) };
}

/** 고를 수 있는 과목·반 (행에 나온 것만) */
export function choices(rows: StatRow[], subject = ""): { subjects: string[]; classes: string[] } {
  const subjects = [...new Set(rows.map((r) => r.subject))].sort();
  const classes = [...new Set(rows.filter((r) => !subject || r.subject === subject).map((r) => r.cls))].sort((a, b) =>
    a.localeCompare(b, "ko", { numeric: true }),
  );
  return { subjects, classes };
}
