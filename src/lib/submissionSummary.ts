/**
 * 제출 한 건의 작성 기록 요약 (학습 여정·업적·첫 화면에 쓰는 숫자).
 *
 * 작성 기록(edit_log)은 제출마다 수십~수백 KB라서, 화면을 열 때마다 모든 제출의 기록을 읽으면 느려진다.
 * 제출한 뒤에는 기록이 바뀌지 않으므로 요약을 한 번 계산해 submission_summaries 표(021)에 저장해 두고,
 * 다음부터는 요약만 읽는다 (submissionSummaryStore.ts, submissions.ts의 getMyJourneyData).
 * 여기는 순수 함수만 (단위 테스트: submissionSummary.test.ts).
 */
import { achievementFacts, type AchievementFacts } from "./achievements";
import { countFixedErrors, kstDate, type SubmissionSummary } from "./journey";
import { analyzeLog, validEntries, type ReplayStats } from "./replay";

/**
 * 요약 계산 방법의 판 번호. 통계(replay.ts analyzeLog)·업적 판정(achievements.ts achievementFacts)·
 * countFixedErrors의 계산을 바꾸면 이 번호를 올린다 → 예전 요약은 버리고 다시 계산한다.
 */
export const SUMMARY_VERSION = 1;

export type SummaryData = {
  /** 재생기와 같은 통계 */
  stats: ReplayStats;
  /** 편집 기록이 있는지 */
  hasLog: boolean;
  /** 형식이 맞는 기록 항목 수 (연습 모드의 "막힌 곳"은 2개 이상인 제출만 본다) */
  events: number;
  /** 오류가 난 뒤 다시 실행해 성공한 횟수 */
  fixedErrors: number;
  /** 업적 판정에 쓰는 값 */
  facts: AchievementFacts;
};

/** 작성 기록에서 요약을 계산한다 */
export function summaryDataOf(init: string | null, log: unknown, code: string | null): SummaryData {
  const { edits, stats } = analyzeLog(init ?? "", log);
  return {
    stats,
    hasLog: edits.length > 0,
    events: validEntries(log).length,
    fixedErrors: countFixedErrors(log),
    facts: achievementFacts(log, code ?? ""),
  };
}

/** 저장해 둔 요약이 쓸 수 있는 모양인지 (DB에서 읽은 값 확인) */
export function isSummaryData(v: unknown): v is SummaryData {
  const d = v as Partial<SummaryData> | null;
  return (
    !!d &&
    typeof d === "object" &&
    !!d.stats &&
    typeof d.stats.totalMs === "number" &&
    typeof d.hasLog === "boolean" &&
    typeof d.events === "number" &&
    typeof d.fixedErrors === "number" &&
    !!d.facts &&
    Array.isArray(d.facts.fixedKinds)
  );
}

/** 제출 정보 + 요약 → 학습 여정의 제출 한 건 (journey.ts summarizeSubmission과 같은 결과) */
export function toSubmissionSummary(
  row: { id: number; subject: string; problem: string; submitted_at: string },
  d: SummaryData,
): SubmissionSummary {
  return {
    id: row.id,
    subject: row.subject,
    problem: row.problem,
    submittedAt: row.submitted_at,
    date: kstDate(row.submitted_at),
    hasLog: d.hasLog,
    totalMs: d.stats.totalMs,
    activeMs: d.stats.activeMs,
    typedChars: d.stats.typedChars,
    pastedChars: d.stats.pastedChars,
    runCount: d.stats.runCount,
    runErrorCount: d.stats.runErrorCount,
    fixedErrors: d.fixedErrors,
    editCount: d.stats.editCount,
    pauseCount: d.stats.pauseCount,
    stats: d.stats,
  };
}
