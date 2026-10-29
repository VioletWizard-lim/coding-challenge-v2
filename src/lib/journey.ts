/**
 * 나의 학습 여정: 제출들의 작성 기록을 모아 "언제, 무엇을, 어떻게 풀어 왔는지" 계산한다.
 * 감시가 아니라 성찰용이다. 잘한 것(직접 작성, 스스로 고친 오류)을 중심으로 보여 준다.
 */
import { analyzeLog } from "./replay";

export type SubmissionSummary = {
  id: number;
  subject: string;
  problem: string;
  submittedAt: string;
  /** 한국 날짜 YYYY-MM-DD */
  date: string;
  /** 작성 기록이 있는지 (기록 기능 전의 v1 제출은 없음) */
  hasLog: boolean;
  totalMs: number;
  activeMs: number;
  typedChars: number;
  pastedChars: number;
  runCount: number;
  runErrorCount: number;
  /** 오류가 난 뒤 다시 실행해 성공한 횟수 */
  fixedErrors: number;
  editCount: number;
  pauseCount: number;
};

export type Journey = {
  totals: {
    problems: number;
    submissions: number;
    days: number;
    activeMs: number;
    /** 직접 입력 / (직접 입력 + 붙여넣기). 기록이 없으면 null */
    typedRatio: number | null;
    fixedErrors: number;
  };
  /** 최근 12주 활동 달력 (월요일 시작) */
  calendar: { weekStart: string; days: { date: string; count: number; future: boolean }[] }[];
  /** 최근 12주 주별 변화 */
  weekly: { weekStart: string; submissions: number; typedRatio: number | null; fixedErrors: number }[];
  /** 단원별 걸린 시간 (기록이 있는 제출만) */
  units: { subject: string; unit: string; problems: number; avgActiveMs: number; runErrors: number; pauses: number }[];
  /** 날짜별 제출 (최근 날짜부터) */
  days: { date: string; items: SubmissionSummary[] }[];
};

const WEEKS = 12;

/** 한국 시간 기준 날짜 YYYY-MM-DD */
export function kstDate(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));
}

const toUtc = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => fromUtc(toUtc(date) + n * 86_400_000);

/** 그 날짜가 든 주의 월요일 */
export function weekStartOf(date: string) {
  const day = new Date(toUtc(date)).getUTCDay(); // 0=일
  return addDays(date, -((day + 6) % 7));
}

/** 오류 실행 뒤 다시 실행해서 성공한 횟수 (연속 오류는 한 번으로) */
export function countFixedErrors(log: unknown): number {
  if (!Array.isArray(log)) return 0;
  let fixed = 0;
  let failing = false;
  for (const e of log) {
    if (!Array.isArray(e) || e.length !== 2 || typeof e[1] !== "string" || !e[1].startsWith("r:")) continue;
    if (e[1] === "r:ok") {
      if (failing) fixed++;
      failing = false;
    } else failing = true;
  }
  return fixed;
}

/** 제출 한 건의 기록을 요약한다 */
export function summarizeSubmission(row: {
  id: number;
  subject: string;
  problem: string;
  submitted_at: string;
  init_code: string | null;
  edit_log: unknown;
}): SubmissionSummary {
  const { edits, stats } = analyzeLog(row.init_code ?? "", row.edit_log);
  return {
    id: row.id,
    subject: row.subject,
    problem: row.problem,
    submittedAt: row.submitted_at,
    date: kstDate(row.submitted_at),
    hasLog: edits.length > 0,
    totalMs: stats.totalMs,
    activeMs: stats.activeMs,
    typedChars: stats.typedChars,
    pastedChars: stats.pastedChars,
    runCount: stats.runCount,
    runErrorCount: stats.runErrorCount,
    fixedErrors: countFixedErrors(row.edit_log),
    editCount: stats.editCount,
    pauseCount: stats.pauseCount,
  };
}

const ratio = (items: SubmissionSummary[]) => {
  const typed = items.reduce((s, x) => s + x.typedChars, 0);
  const pasted = items.reduce((s, x) => s + x.pastedChars, 0);
  return typed + pasted ? typed / (typed + pasted) : null;
};

/** "2-3" → "2" (단원 번호) */
const unitOf = (problem: string) => problem.split("-")[0];

export function buildJourney(subs: SubmissionSummary[], today: string): Journey {
  const logged = subs.filter((s) => s.hasLog);
  const countByDate = new Map<string, number>();
  for (const s of subs) countByDate.set(s.date, (countByDate.get(s.date) ?? 0) + 1);

  const firstWeek = addDays(weekStartOf(today), -7 * (WEEKS - 1));
  const calendar = Array.from({ length: WEEKS }, (_, w) => {
    const weekStart = addDays(firstWeek, 7 * w);
    return {
      weekStart,
      days: Array.from({ length: 7 }, (_, d) => {
        const date = addDays(weekStart, d);
        return { date, count: countByDate.get(date) ?? 0, future: date > today };
      }),
    };
  });

  const weekly = calendar.map(({ weekStart }) => {
    const inWeek = subs.filter((s) => weekStartOf(s.date) === weekStart);
    const withLog = inWeek.filter((s) => s.hasLog);
    return {
      weekStart,
      submissions: inWeek.length,
      typedRatio: ratio(withLog),
      fixedErrors: withLog.reduce((n, s) => n + s.fixedErrors, 0),
    };
  });

  const unitMap = new Map<string, SubmissionSummary[]>();
  for (const s of logged) {
    const key = `${s.subject}\u0000${unitOf(s.problem)}`;
    unitMap.set(key, [...(unitMap.get(key) ?? []), s]);
  }
  const units = [...unitMap.entries()]
    .map(([key, items]) => {
      const [subject, unit] = key.split("\u0000");
      return {
        subject,
        unit,
        problems: new Set(items.map((s) => s.problem)).size,
        avgActiveMs: items.reduce((n, s) => n + s.activeMs, 0) / items.length,
        runErrors: items.reduce((n, s) => n + s.runErrorCount, 0),
        pauses: items.reduce((n, s) => n + s.pauseCount, 0),
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject) || Number(a.unit) - Number(b.unit));

  const dayMap = new Map<string, SubmissionSummary[]>();
  for (const s of [...subs].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))) {
    dayMap.set(s.date, [...(dayMap.get(s.date) ?? []), s]);
  }

  return {
    totals: {
      problems: new Set(subs.map((s) => `${s.subject}_${s.problem}`)).size,
      submissions: subs.length,
      days: countByDate.size,
      activeMs: logged.reduce((n, s) => n + s.activeMs, 0),
      typedRatio: ratio(logged),
      fixedErrors: logged.reduce((n, s) => n + s.fixedErrors, 0),
    },
    calendar,
    weekly,
    units,
    days: [...dayMap.entries()].map(([date, items]) => ({ date, items })),
  };
}
