/**
 * 교사 채점 보조: AI 채점 초안. 브라우저·서버 공용 순수 함수 (AI 호출: ai.ts, DB: gradingDraftStore.ts).
 * 초안은 칸을 채워 줄 뿐이고, 저장은 교사가 확인한 뒤에 한다. 단위 테스트: gradingDraft.test.ts
 */
import type { RubricPart } from "./grading";

export type DraftPart = RubricPart & { score: number; reason: string };

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

/** AI 응답 형식 (structured output) */
export const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    parts: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, score: { type: "integer" }, reason: { type: "string" } },
        required: ["name", "score", "reason"],
        additionalProperties: false,
      },
    },
    feedback: { type: "string" },
    note: { type: "string" },
  },
  required: ["parts", "feedback", "note"],
  additionalProperties: false,
} as const;

/**
 * AI 응답을 채점 기준에 맞춘다: 영역은 기준의 순서·이름대로(이름이 다르면 순서로), 점수는 0~배점 정수로 자른다.
 * 영역 수가 맞지 않으면 null (다시 만들기).
 */
export function toDraft(raw: unknown, rubric: RubricPart[]): Omit<GradingDraft, "id" | "submissionId" | "createdAt"> | null {
  const r = (raw ?? {}) as { parts?: unknown; feedback?: unknown; note?: unknown };
  if (!Array.isArray(r.parts)) return null;
  const items = r.parts.map((p) => (p ?? {}) as { name?: unknown; score?: unknown; reason?: unknown });
  if (items.length < rubric.length) return null;
  const parts = rubric.map((part, i) => {
    const item = items.find((x) => String(x.name ?? "").trim() === part.name) ?? items[i];
    const n = Math.round(Number(item.score));
    return { ...part, score: Number.isFinite(n) ? Math.min(part.max, Math.max(0, n)) : 0, reason: String(item.reason ?? "").trim() };
  });
  return { parts, feedback: String(r.feedback ?? "").trim(), note: String(r.note ?? "").trim() };
}

/** 채점 기준(이름·배점)이 초안을 만들 때와 같은지 (바뀌었으면 다시 만든다) */
export const draftMatches = (parts: DraftPart[], rubric: RubricPart[]) =>
  parts.length === rubric.length && parts.every((p, i) => p.name === rubric[i].name && p.max === rubric[i].max);
