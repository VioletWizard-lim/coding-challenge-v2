/**
 * 학습지(PDF·사진)에서 AI가 뽑은 문제를 우리 문제 형식으로 바꾼다. AI 호출은 ai.ts, 여기는 순수 함수만.
 */
import { MAX_EXAMPLES, NUMBER_PATTERN, type Example, type ProblemInput } from "./problemBank";

/** AI에게 요구하는 출력 모양 (structured outputs JSON schema) */
export const WORKSHEET_SCHEMA = {
  type: "object",
  properties: {
    problems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: { type: "string", description: '문제 번호. "1-6"처럼 단원-번호' },
          title: { type: "string", description: "문제 제목 (번호 뒤의 이름)" },
          difficulty: { type: "integer", description: "난이도 별 개수 1~5. 표시가 없으면 0" },
          description: { type: "string", description: "'문제' 칸의 글 그대로" },
          conditions: { type: "array", items: { type: "string" }, description: "'조건' 칸의 항목들, 앞의 번호는 빼고" },
          examples: {
            type: "array",
            items: {
              type: "object",
              properties: {
                input: { type: "string", description: "예시의 입력값 줄 그대로 (없으면 빈 문자열)" },
                output: { type: "string", description: "예시의 출력, 줄바꿈 그대로" },
              },
              required: ["input", "output"],
              additionalProperties: false,
            },
          },
          goal: { type: "string", description: "'문제 목표' 칸의 글 (없으면 빈 문자열)" },
          challenge: { type: "string", description: "'도전 과제' 칸의 글 (없으면 빈 문자열)" },
        },
        required: ["number", "title", "difficulty", "description", "conditions", "examples", "goal", "challenge"],
        additionalProperties: false,
      },
    },
  },
  required: ["problems"],
  additionalProperties: false,
} as const;

export type ExtractedProblem = Omit<ProblemInput, "openAt">;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** AI 응답(JSON)을 문제 목록으로. 형식이 어긋난 값은 고쳐 쓰거나 비우고, 번호가 이상하면 그대로 두어 미리보기에서 걸러지게 한다 */
export function toProblems(json: unknown, subject: string): ExtractedProblem[] {
  const list = (json as { problems?: unknown } | null)?.problems;
  if (!Array.isArray(list)) return [];
  return list.map((raw) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const number = str(p.number).replace(/\s+/g, "").replace(/[.·]/g, "-");
    const difficulty = Number(p.difficulty);
    const examples: Example[] = (Array.isArray(p.examples) ? p.examples : [])
      .map((e) => ({ input: str((e as Example)?.input), output: str((e as Example)?.output) }))
      .filter((e) => e.input || e.output)
      .slice(0, MAX_EXAMPLES);
    const conditions = Array.isArray(p.conditions) ? p.conditions.map(str).filter(Boolean) : [];
    return {
      subject,
      number,
      title: str(p.title) || number,
      difficulty: Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : null,
      description: str(p.description),
      conditions: conditions.map((c) => c.replace(/^\d+[.)]\s*/, "")).join("\n"),
      examples,
      goal: str(p.goal),
      challenge: str(p.challenge),
      starterCode: "",
    };
  });
}

/** 번호가 올바른 문제만 세기 (안내 문구용) */
export const validNumberCount = (list: ExtractedProblem[]) => list.filter((p) => NUMBER_PATTERN.test(p.number)).length;

/** 올릴 수 있는 학습지 파일 */
export const WORKSHEET_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
/** Vercel 요청 한도(4.5MB)보다 조금 작게 */
export const MAX_WORKSHEET_BYTES = 4 * 1024 * 1024;
export const MAX_WORKSHEET_FILES = 10;
