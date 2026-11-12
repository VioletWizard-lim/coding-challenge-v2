import "server-only";
import type { StatRow } from "./classStats";
import { db, fetchAll, type RangeQuery } from "./db";
import { classOf } from "./classes";
import { summaryDataOf } from "./submissionSummary";
import { EMPTY_SUMMARY, summariesFor } from "./submissionSummaryStore";
import { hasUserIdColumn } from "./submissions";

type Row = {
  id: number;
  submitted_at: string;
  name: string;
  user_id?: string | null;
  grade: number | string | null;
  class: number | string | null;
  problem: string;
  score_total: number | null;
  wrong_reason: string | null;
  init_code?: string | null;
  edit_log?: unknown;
};

/** 이 과목에 제출이 있는 연도들 (최근부터) */
export async function yearsWithSubmissions(subject: string): Promise<number[]> {
  const rows = await fetchAll<{ id: number; year: number | null }>(
    () => db().from("submissions").select("id, year").eq("subject", subject).order("id") as unknown as RangeQuery<{ id: number; year: number | null }>,
  );
  return [...new Set(rows.map((r) => Number(r.year)).filter((y) => Number.isInteger(y) && y > 0))].sort((a, b) => b - a);
}

/**
 * 반별 현황용: 이 과목·연도의 모든 제출 (작성 기록은 서버에서 요약만 만든다).
 * 학생은 아이디로 묶는다: 제출의 user_id, 없으면 이름이 하나뿐인 학생의 아이디, 그것도 없으면 이름.
 * withLogs=true면 원본 로그도 돌려준다 (원본 로그 CSV용).
 */
export async function loadStatRows(subject: string, year: number, withLogs = false): Promise<{ rows: StatRow[]; logs: Map<number, unknown[]> }> {
  const withUserId = await hasUserIdColumn();
  // 작성 기록은 원본 로그 CSV를 만들 때만 읽는다. 화면에는 저장해 둔 요약(021)을 쓴다
  const columns = [
    "id, submitted_at, name, grade, class, problem, score_total, wrong_reason",
    ...(withLogs ? ["init_code, edit_log"] : []),
    ...(withUserId ? ["user_id"] : []),
  ].join(", ");
  const [subs, users] = await Promise.all([
    fetchAll<Row>(
      () => db().from("submissions").select(columns).eq("subject", subject).eq("year", year).order("id") as unknown as RangeQuery<Row>,
      withLogs ? 200 : 1000,
    ),
    fetchAll<{ id: string; name: string }>(
      () => db().from("users").select("id, name").eq("role", "student").order("id") as unknown as RangeQuery<{ id: string; name: string }>,
    ),
  ]);
  const byName = new Map<string, string[]>();
  for (const u of users) byName.set(u.name, [...(byName.get(u.name) ?? []), String(u.id)]);
  const logs = new Map<number, unknown[]>();
  const summaries = withLogs ? null : await summariesFor(subs.map((r) => Number(r.id)));
  const rows = subs.map((r): StatRow => {
    const named = byName.get(r.name);
    const studentId = r.user_id ?? (named?.length === 1 ? named[0] : "");
    const { hasLog, stats } = summaries
      ? (summaries.get(Number(r.id)) ?? EMPTY_SUMMARY)
      : summaryDataOf(r.init_code ?? "", r.edit_log, null);
    if (withLogs && Array.isArray(r.edit_log)) logs.set(Number(r.id), r.edit_log);
    return {
      id: Number(r.id),
      key: studentId || `이름:${r.name}`,
      studentId,
      name: r.name,
      cls: classOf(r.grade, r.class),
      problem: r.problem,
      submittedAt: r.submitted_at,
      score: r.score_total,
      wrong: !!r.wrong_reason?.trim(),
      writing: hasLog
        ? {
            totalMs: stats.totalMs,
            activeMs: stats.activeMs,
            typed: stats.typedChars,
            pasted: stats.pastedChars,
            pasteCount: stats.pasteCount,
            editCount: stats.editCount,
            awayCount: stats.awayCount,
            awayMs: stats.awayMs,
          }
        : null,
    };
  });
  return { rows, logs };
}
