/**
 * 재생 화면의 "도움도 과정의 일부" (CLAUDE.md 핵심 방향): AI 도움 요청 순간과 그 뒤 학생의 행동을 잇는다.
 * - 도움 요청 [시각, "q"] ↔ ai_chats의 질문·답 (같은 시각)
 * - 붙여넣기 중 AI 답에 있던 글을 붙여넣은 것 ("AI 답 붙여넣기")
 * - 도움 뒤 첫 실행 결과 (스스로 고쳐 성공했는지)
 * 감점·경고가 아니라 사실만 보여 주는 데 쓴다. 순수 함수만 — 단위 테스트: helpTrail.test.ts
 */
import type { EditEvent } from "./editLog";
import type { Moment } from "./process-summary";
import { validEntries } from "./replay";

export type HelpChat = { at: number; question: string; answer: string; moments: Moment[] };

export type HelpStep = {
  /** 도움 요청 시각 (기록 안) */
  askAt: number;
  /** 그때의 질문·답 (대화 기록이 없으면 null: 010 실행 전, v1 등) */
  chat: HelpChat | null;
  /** 이 도움 뒤(다음 도움 전까지) AI 답에서 붙여넣은 시각들 */
  aiPastes: number[];
  /** 도움 뒤 첫 실행 (없으면 null) */
  nextRun: { at: number; ok: boolean; error: string | null } | null;
};

/** 질문 시각과 대화 기록의 시각은 같게 저장되지만, 혹시 어긋나도 2초 안이면 같은 요청으로 본다 */
const SAME_ASK_MS = 2000;
/** 이보다 짧은 붙여넣기는 AI 답과 비교하지 않는다 (괄호 하나 같은 것) */
const MIN_PASTE_CHARS = 6;

const squash = (s: string) => s.replace(/\s+/g, "");

/** 붙여넣은 글이 AI 답에서 온 것인지: 답 안에 그 글이 있거나, 답의 `코드` 조각이 붙여넣은 글 안에 있으면 */
export function fromAnswer(pasted: string, answer: string): boolean {
  const p = squash(pasted);
  if (p.length < MIN_PASTE_CHARS) return false;
  const a = squash(answer.replace(/```[^\n]*\n?/g, "").replace(/`/g, ""));
  if (a.includes(p)) return true;
  const pieces = [...answer.matchAll(/`([^`\n]+)`/g)].map((m) => squash(m[1])).filter((x) => x.length >= MIN_PASTE_CHARS);
  return pieces.some((x) => p.includes(x));
}

/** AI 답에서 붙여넣은 붙여넣기 시각들 (그 붙여넣기 전에 받은 답과 비교) */
export function aiPasteTimes(log: unknown, chats: HelpChat[]): Set<number> {
  const times = new Set<number>();
  for (const e of validEntries(log)) {
    if (e.length <= 2 || e[1] !== "p") continue;
    const [t, , , , , , text] = e as EditEvent;
    if (chats.some((c) => c.at <= t && fromAnswer(text, c.answer))) times.add(t);
  }
  return times;
}

/** 도움 요청마다: 그때의 대화, 그 뒤 AI 답 붙여넣기, 도움 뒤 첫 실행 */
export function helpTrail(log: unknown, chats: HelpChat[]): HelpStep[] {
  const events = validEntries(log);
  const asks = events.filter((e) => e.length === 2 && e[1] === "q").map((e) => e[0]);
  const pastes = aiPasteTimes(log, chats);
  return asks.map((askAt, i) => {
    const until = asks[i + 1] ?? Infinity;
    // 가장 가까운 시각의 대화 (2초 안)
    const chat =
      chats
        .filter((c) => Math.abs(c.at - askAt) <= SAME_ASK_MS)
        .sort((a, b) => Math.abs(a.at - askAt) - Math.abs(b.at - askAt))[0] ?? null;
    const run = events.find((e) => e.length === 2 && e[0] > askAt && e[1].startsWith("r:"));
    return {
      askAt,
      chat,
      aiPastes: [...pastes].filter((t) => t > askAt && t < until).sort((a, b) => a - b),
      nextRun: run ? { at: run[0], ok: run[1] === "r:ok", error: run[1] === "r:ok" ? null : run[1].slice(2) || "오류" } : null,
    };
  });
}
