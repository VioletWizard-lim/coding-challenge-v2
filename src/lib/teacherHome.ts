import "server-only";
import { classOf } from "./classes";
import { db, fetchAll } from "./db";
import { kstDate } from "./journey";
import type { Problem } from "./problemBank";
import type { ReflectionDay } from "./reflectionStore";

export type TodayClass = { subject: string; cls: string; students: number; submissions: number; reflected: number };
export type TeacherHomeData = {
  today: string;
  /** 오늘 과목·반별 현황 (제출 반 기준: 프로그래밍이면 프로그래밍 반) */
  classes: TodayClass[];
  /** 오늘 문제별 제출 학생 수 (많은 순) */
  problems: { subject: string; problem: string; students: number }[];
  totalToday: number;
  /** 아직 점수도 오답 처리도 안 된 제출 수 (v1 채점 대기와 같은 기준) */
  pending: number;
  upcoming: { subject: string; number: string; title: string; openAt: string }[];
  recentlyOpened: { subject: string; number: string; title: string; openAt: string }[];
};

/** 오늘(한국 시간) 들어온 제출 (무거운 기록은 빼고) */
function todaySubmissions(today: string) {
  return fetchAll<{ id: number; name: string; subject: string; problem: string; grade: number | string | null; class: number | string | null }>(() =>
    db()
      .from("submissions")
      .select("id, name, subject, problem, grade, class")
      .gte("submitted_at", `${today}T00:00:00+09:00`)
      .order("id"),
  );
}

/** 채점 대기: 점수가 없고 오답 처리도 안 된 제출 수 */
async function pendingCount(): Promise<number> {
  const { count, error } = await db()
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .is("score_total", null)
    .is("wrong_reason", null);
  if (error) throw new Error(`채점 대기 조회 실패: ${error.message}`);
  return count ?? 0;
}

const DAY = 86_400_000;

/** 교사 첫 화면: 오늘 수업 현황, 채점 대기, 문제 공개 일정 */
export async function getTeacherHome(problems: Problem[], reflectionDays: ReflectionDay[]): Promise<TeacherHomeData> {
  const now = new Date();
  const today = kstDate(now);
  const [subs, pending] = await Promise.all([todaySubmissions(today), pendingCount()]);

  const byClass = new Map<string, { subject: string; cls: string; names: Set<string>; submissions: number; reflected: Set<string> }>();
  const keyOf = (subject: string, cls: string) => `${subject}_${cls}`;
  const entry = (subject: string, cls: string) => {
    const key = keyOf(subject, cls);
    if (!byClass.has(key)) byClass.set(key, { subject, cls, names: new Set(), submissions: 0, reflected: new Set() });
    return byClass.get(key)!;
  };
  for (const s of subs) {
    const e = entry(s.subject, classOf(s.grade, s.class) || "반 없음");
    e.names.add(s.name);
    e.submissions++;
  }
  for (const r of reflectionDays.filter((d) => d.classDate === today)) {
    entry(r.subject, classOf(r.grade, r.class) || "반 없음").reflected.add(r.userId);
  }
  const classes = [...byClass.values()]
    .map((e) => ({ subject: e.subject, cls: e.cls, students: e.names.size, submissions: e.submissions, reflected: e.reflected.size }))
    .sort((a, b) => a.subject.localeCompare(b.subject) || a.cls.localeCompare(b.cls, "ko", { numeric: true }));

  const perProblem = new Map<string, { subject: string; problem: string; names: Set<string> }>();
  for (const s of subs) {
    const key = `${s.subject}_${s.problem}`;
    if (!perProblem.has(key)) perProblem.set(key, { subject: s.subject, problem: s.problem, names: new Set() });
    perProblem.get(key)!.names.add(s.name);
  }

  const withOpen = problems.filter((p): p is Problem & { openAt: string } => p.openAt !== null);
  const pick = (p: Problem & { openAt: string }) => ({ subject: p.subject, number: p.number, title: p.title, openAt: p.openAt });
  return {
    today,
    classes,
    problems: [...perProblem.values()]
      .map((p) => ({ subject: p.subject, problem: p.problem, students: p.names.size }))
      .sort((a, b) => b.students - a.students)
      .slice(0, 8),
    totalToday: subs.length,
    pending,
    upcoming: withOpen
      .filter((p) => Date.parse(p.openAt) > now.getTime())
      .sort((a, b) => a.openAt.localeCompare(b.openAt))
      .slice(0, 6)
      .map(pick),
    recentlyOpened: withOpen
      .filter((p) => Date.parse(p.openAt) <= now.getTime() && now.getTime() - Date.parse(p.openAt) < 7 * DAY)
      .sort((a, b) => b.openAt.localeCompare(a.openAt))
      .slice(0, 6)
      .map(pick),
  };
}
