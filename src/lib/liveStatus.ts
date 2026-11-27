/**
 * 작성 중 상태 (2027 작업 지시서 P3): 교사 화면의 "지금 수업 중" 카드에 쓰는 순수 함수.
 * 학생 브라우저가 작성 기록에서 상태를 계산해 보내고(livePayload), 교사 화면이 표시할 학생을 고른다(liveFlags).
 * 코드 내용은 담지 않는다. 기준값은 stuckRules.ts live. 단위 테스트: liveStatus.test.ts
 */
import { isAutoEvent, isNudgeEvent, NUDGE_REACTIONS, validEntries } from "./replay";
import { STUCK_RULES } from "./stuckRules";

/** 학생 브라우저가 보내는 상태 */
export type LivePayload = {
  openedAt: number;
  firstInputAt: number | null;
  lastActiveAt: number | null;
  nudgeCount: number;
  lastNudgeRule: string | null;
};

/** 이번에 문제를 연 뒤(openedAt 이후)의 기록으로 상태를 만든다 */
export function livePayload(log: unknown, openedAt: number): LivePayload {
  const after = validEntries(log).filter((e) => e[0] >= openedAt);
  const edits = after.filter((e) => e.length > 2);
  const active = after.filter((e) => !isAutoEvent(e));
  const nudges = after.filter((e) => isNudgeEvent(e) && !NUDGE_REACTIONS[e[1]]);
  const last = nudges[nudges.length - 1];
  return {
    openedAt,
    firstInputAt: edits.length ? edits[0][0] : null,
    lastActiveAt: active.length ? active[active.length - 1][0] : null,
    nudgeCount: nudges.length,
    lastNudgeRule: last ? last[1].slice(2).split("@")[0] : null,
  };
}

/** 교사 화면에 보여 줄 한 줄 */
export type LiveRow = LivePayload & {
  userId: string;
  name: string;
  cls: string;
  subject: string;
  problem: string;
  updatedAt: number;
};

/**
 * present: 지금 그 화면에 있음 (presentMs 안에 상태를 보냄)
 * lateStart: 문제를 연 지 lateStartMs가 지났는데 첫 입력이 없음 / repeatedStuck: 막힘 알림이 repeatedNudges번 이상
 */
export function liveFlags(row: Pick<LiveRow, "openedAt" | "firstInputAt" | "nudgeCount" | "updatedAt">, now: number) {
  const R = STUCK_RULES.live;
  const present = now - row.updatedAt <= R.presentMs;
  return {
    present,
    lateStart: present && row.firstInputAt === null && now - row.openedAt >= R.lateStartMs,
    repeatedStuck: present && row.nudgeCount >= R.repeatedNudges,
    /** 문제를 연 지 몇 분 */
    openMinutes: Math.max(0, Math.floor((now - row.openedAt) / 60_000)),
  };
}

/** 학생은 한 번에 한 문제만 쓰므로, 학생마다 가장 최근에 상태를 보낸 문제 하나만 (문제를 바꾸면 앞 문제 줄은 숨긴다) */
export function latestPerStudent<T extends Pick<LiveRow, "userId" | "updatedAt">>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const cur = best.get(r.userId);
    if (!cur || r.updatedAt > cur.updatedAt) best.set(r.userId, r);
  }
  return rows.filter((r) => best.get(r.userId) === r);
}
