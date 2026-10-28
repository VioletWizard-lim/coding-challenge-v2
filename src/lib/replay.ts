/**
 * 재생용 기록 분석: 통계(v1 replay.html·summarize_log와 같은 기준)와 타임라인 표시.
 * 교사·학생 화면이 같이 쓴다. 감시가 아니라 성찰용이므로 "몇 번 했다"를 사실대로만 보여 준다.
 */
import { editRange, type EditEvent, type LogEvent } from "./editLog";

/** 이 시간보다 오래 아무 기록이 없으면 "멈춤"으로 표시 */
export const PAUSE_MS = 60_000;
/** 이벤트 간격이 이보다 짧은 구간만 "실제 작업 시간"으로 친다 (v1과 같음) */
const ACTIVE_GAP_MS = 30_000;
/** 한 번에 이만큼 넘게 지우면 "크게 지움"으로 표시 */
export const BIG_DELETE_CHARS = 30;

export type MarkKind = "paste" | "away" | "run-ok" | "run-error" | "pause" | "bigdelete" | "ask";

export type Mark = {
  kind: MarkKind;
  /** 편집 이벤트가 몇 개 적용된 시점인지 (재생 위치) */
  at: number;
  /** 일어난 시각(ms) */
  time: number;
  detail: string;
};

export type ReplayStats = {
  totalMs: number;
  activeMs: number;
  typedChars: number;
  pastedChars: number;
  pasteCount: number;
  /** 삭제·잘라내기 횟수 */
  editCount: number;
  awayCount: number;
  awayMs: number;
  runCount: number;
  runErrorCount: number;
  pauseCount: number;
  askCount: number;
};

export type Analysis = { edits: EditEvent[]; marks: Mark[]; stats: ReplayStats; startTime: number };

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${s % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

/** 형식이 맞는 기록 항목만 (v1 valid_entries와 같음) */
function validEntries(log: unknown): LogEvent[] {
  if (!Array.isArray(log)) return [];
  return log.filter(
    (e): e is LogEvent => Array.isArray(e) && e.length >= 2 && typeof e[0] === "number" && typeof e[1] === "string",
  );
}

const isEdit = (e: LogEvent): e is EditEvent => e.length > 2 && typeof e[6] === "string";

export function analyzeLog(init: string, log: unknown): Analysis {
  const all = validEntries(log);
  const edits: EditEvent[] = [];
  const marks: Mark[] = [];
  const stats: ReplayStats = {
    totalMs: all.length ? all[all.length - 1][0] - all[0][0] : 0,
    activeMs: 0,
    typedChars: 0,
    pastedChars: 0,
    pasteCount: 0,
    editCount: 0,
    awayCount: 0,
    awayMs: 0,
    runCount: 0,
    runErrorCount: 0,
    pauseCount: 0,
    askCount: 0,
  };

  let doc = init;
  let awayMark: Mark | null = null;
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    const at = edits.length;
    if (i > 0) {
      const gap = e[0] - all[i - 1][0];
      if (gap < ACTIVE_GAP_MS) stats.activeMs += gap;
      else if (gap >= PAUSE_MS && !awayMark) {
        stats.pauseCount++;
        marks.push({ kind: "pause", at, time: all[i - 1][0], detail: `${formatDuration(gap)} 멈춤` });
      }
    }

    if (isEdit(e)) {
      const lines = doc.split("\n").map((l) => l.length);
      const { from, to } = editRange(lines, e);
      const removed = to - from;
      if (e[1] === "i") stats.typedChars += e[6].length;
      if (e[1] === "p") {
        stats.pasteCount++;
        stats.pastedChars += e[6].length;
        marks.push({ kind: "paste", at, time: e[0], detail: `${e[6].length}자 붙여넣기` });
      }
      if (e[1] === "d" || e[1] === "x") {
        stats.editCount++;
        if (removed >= BIG_DELETE_CHARS) {
          marks.push({ kind: "bigdelete", at, time: e[0], detail: `${removed}자 ${e[1] === "x" ? "잘라냄" : "지움"}` });
        }
      }
      doc = doc.slice(0, from) + e[6] + doc.slice(to);
      edits.push(e);
      continue;
    }

    const kind = e[1];
    if (kind === "b" && !awayMark) {
      stats.awayCount++;
      awayMark = { kind: "away", at, time: e[0], detail: "다른 창으로 이동" };
      marks.push(awayMark);
    } else if (kind === "f" && awayMark) {
      const ms = e[0] - awayMark.time;
      stats.awayMs += ms;
      awayMark.detail = `다른 창으로 이동 (${formatDuration(ms)})`;
      awayMark = null;
    } else if (kind === "r:ok") {
      stats.runCount++;
      marks.push({ kind: "run-ok", at, time: e[0], detail: "실행 성공" });
    } else if (kind.startsWith("r:")) {
      stats.runCount++;
      stats.runErrorCount++;
      marks.push({ kind: "run-error", at, time: e[0], detail: `실행 오류: ${kind.slice(2)}` });
    } else if (kind === "q") {
      stats.askCount++;
      marks.push({ kind: "ask", at, time: e[0], detail: "AI에게 도움 요청" });
    }
  }
  return { edits, marks, stats, startTime: all.length ? all[0][0] : 0 };
}
