/**
 * 교사 채점 보조: AI 채점 초안. 브라우저·서버 공용 순수 함수 (AI 호출: ai.ts, DB: gradingDraftStore.ts).
 * 초안은 칸을 채워 줄 뿐이고, 저장은 교사가 확인한 뒤에 한다. 단위 테스트: gradingDraft.test.ts
 */
import type { RubricPart } from "./grading";

/** 감점·가산 항목 하나 (points: -5, +5 처럼) */
export type DraftChange = { reason: string; points: number };

/**
 * 영역 하나의 초안. 점수는 AI가 정하지 않고 start + changes 합계로 계산한다(0~배점).
 * reason은 영역 전체에 대한 한마디. (예전 초안은 changes가 없고 score·reason만 있다)
 */
export type DraftPart = RubricPart & { score: number; reason: string; start?: number; changes?: DraftChange[] };

export type GradingDraft = {
  id: number;
  submissionId: number;
  parts: DraftPart[];
  /** 학생에게 보여 줄 감점 이유 초안 */
  feedback: string;
  /** 교사에게만: 작성 과정에서 본 것 */
  note: string;
  createdAt: string;
};

/** AI 응답 형식 (structured output): 영역마다 시작 점수와 감점·가산 항목. 점수 계산은 서버가 한다 */
export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          start: { type: "integer" },
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: { reason: { type: "string" }, points: { type: "integer" } },
              required: ["reason", "points"],
              additionalProperties: false,
            },
          },
          comment: { type: "string" },
        },
        required: ["name", "start", "changes", "comment"],
        additionalProperties: false,
      },
    },
    feedback: { type: "string" },
    note: { type: "string" },
  },
  required: ["parts", "feedback", "note"],
  additionalProperties: false,
} as const;

const toInt = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/**
 * AI 응답을 채점 기준에 맞춘다: 영역은 기준의 순서·이름대로(이름이 다르면 순서로).
 * 점수 = 시작 점수 + 감점·가산 합계를 0~배점으로 자른 값 (AI의 셈을 믿지 않고 서버가 계산한다).
 * 영역 수가 모자라면 null (다시 만들기).
 */
export function toDraft(raw: unknown, rubric: RubricPart[]): Omit<GradingDraft, "id" | "submissionId" | "createdAt"> | null {
  const r = (raw ?? {}) as { parts?: unknown; feedback?: unknown; note?: unknown };
  if (!Array.isArray(r.parts)) return null;
  const items = r.parts.map((p) => (p ?? {}) as { name?: unknown; start?: unknown; changes?: unknown; comment?: unknown });
  if (items.length < rubric.length) return null;
  const parts = rubric.map((part, i) => {
    const item = items.find((x) => String(x.name ?? "").trim() === part.name) ?? items[i];
    const start = Math.min(part.max, Math.max(0, toInt(item.start)));
    const changes = (Array.isArray(item.changes) ? item.changes : [])
      .map((c) => ({ reason: String((c as DraftChange)?.reason ?? "").trim(), points: toInt((c as DraftChange)?.points) }))
      .filter((c) => c.reason && c.points !== 0);
    const total = start + changes.reduce((a, c) => a + c.points, 0);
    return {
      ...part,
      start,
      changes,
      score: Math.min(part.max, Math.max(0, total)),
      reason: String(item.comment ?? "").trim(),
    };
  });
  return { parts, feedback: String(r.feedback ?? "").trim(), note: String(r.note ?? "").trim() };
}

/** 점수 계산을 사람이 읽는 글로: "40 − 5(…) = 35" */
export function scoreFormula(p: DraftPart): string | null {
  if (p.start === undefined || !p.changes) return null;
  if (!p.changes.length) return `${p.start}`;
  const raw = p.start + p.changes.reduce((a, c) => a + c.points, 0);
  const body = `${p.start} ${p.changes.map((c) => `${c.points < 0 ? "−" : "+"} ${Math.abs(c.points)}`).join(" ")} = ${raw}`;
  return raw === p.score ? body : `${body} → ${p.score} (0~${p.max} 안으로)`;
}

/** 채점 기준(이름·배점·설명)이 초안을 만들 때와 같은지 (바뀌었으면 다시 만든다) */
export const draftMatches = (parts: DraftPart[], rubric: RubricPart[]) =>
  parts.length === rubric.length &&
  parts.every((p, i) => p.name === rubric[i].name && p.max === rubric[i].max && (p.desc ?? "") === (rubric[i].desc ?? "")) &&
  // 예전 형식(감점 항목 없이 점수만) 초안은 다시 만든다
  parts.every((p) => Array.isArray(p.changes));
