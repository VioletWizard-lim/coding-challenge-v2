import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { toProblems, WORKSHEET_SCHEMA, type ExtractedProblem } from "./worksheet";

/**
 * AI 호출은 모두 이 파일에서 한다 (CLAUDE.md). 키(ANTHROPIC_API_KEY)와 모델 이름(ANTHROPIC_MODEL)은
 * 서버 환경변수로만 받는다. 나중에 다른 AI로 바꾸거나 고를 때는 이 파일만 고치면 된다.
 */

export class AiNotConfiguredError extends Error {}
export class AiRefusedError extends Error {}

let client: Anthropic | null = null;

function aiClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError("ANTHROPIC_API_KEY가 설정되지 않았어요.");
  // 키는 ANTHROPIC_API_KEY만 쓴다 (서버에 다른 인증 정보가 있어도 섞이지 않게)
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null });
  return client;
}

function aiModel() {
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) throw new AiNotConfiguredError("ANTHROPIC_MODEL이 설정되지 않았어요.");
  return model;
}

export type WorksheetFile =
  | { mediaType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp"; base64: string }
  /** docx에서 브라우저가 뽑은 HTML (표 구조 유지) */
  | { mediaType: "text/html"; text: string };

const WORKSHEET_SYSTEM = `당신은 고등학교 정보 교사를 돕는 도우미입니다. 교사가 올린 프로그래밍 학습지(PDF, 사진, 또는 워드 파일을 바꾼 HTML)에서 문제들을 찾아 정해진 JSON 형식으로 옮겨 적습니다.

학습지의 문제는 보통 이런 표 양식입니다: 제목 줄("1-6 급식 추천 카드 완성"), 난이도(★ 개수), 문제, 조건(번호 목록), 예시, 문제 목표, 도전 과제.

규칙:
- 학습지에 적힌 글을 그대로 옮깁니다. 고치거나 요약하거나 새로 지어내지 않습니다. 읽을 수 없는 칸은 빈 문자열로 둡니다.
- number는 "1-6"처럼 단원-번호, title은 번호 뒤의 문제 이름입니다.
- difficulty는 채워진 별(★)의 개수입니다. 표시가 없으면 0입니다.
- conditions는 조건 칸의 항목을 하나씩, 앞의 "1." 같은 번호는 빼고 적습니다.
- examples는 예시마다 하나씩입니다. 예시 위쪽에 따로 적힌 입력값 줄(예: "길동 / 돈까스 / 볶음밥 / 된장국")은 input에 그대로, 그 아래 출력 내용은 줄바꿈을 지켜 output에 적습니다. 입력값이 없으면 input은 빈 문자열입니다.
- 도전 과제 칸(예: "도전 과제 (경험자용)")의 글은 challenge에 적습니다.
- "오늘의 성찰"처럼 학생이 쓰는 칸, 머리말, 쪽 번호 등 문제가 아닌 부분은 넣지 않습니다.
- 문제가 하나도 없으면 problems를 빈 배열로 둡니다.`;

/** 학습지에서 문제를 뽑는다. 결과는 교사가 미리보기에서 확인한 뒤에만 저장된다 */
export async function extractProblemsFromWorksheet(files: WorksheetFile[], subject: string): Promise<ExtractedProblem[]> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = files.map((f) =>
    f.mediaType === "text/html"
      ? { type: "text", text: `<worksheet_html>\n${f.text}\n</worksheet_html>` }
      : f.mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } }
        : { type: "image", source: { type: "base64", media_type: f.mediaType, data: f.base64 } },
  );
  content.push({ type: "text", text: `이 학습지에 있는 문제를 모두 옮겨 주세요. (과목: ${subject})` });

  // 학습지가 길면 응답이 길어질 수 있어 스트리밍으로 받는다
  const stream = aiClient().beta.messages.stream({
    model: aiModel(),
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // 안전 분류기가 거절하면 다른 모델로 자동으로 다시 시도
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: WORKSHEET_SCHEMA } },
    system: WORKSHEET_SYSTEM,
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new AiRefusedError("AI가 이 파일을 읽지 않았어요.");
  if (message.stop_reason === "max_tokens") throw new Error("학습지가 너무 길어요. 파일을 나눠서 올려 주세요.");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return toProblems(JSON.parse(text), subject);
}
