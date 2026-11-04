/**
 * AI 도우미 대화: 브라우저·서버가 함께 쓰는 순수 함수와 타입. (DB는 aiChatStore.ts, AI 호출은 ai.ts)
 * 단위 테스트: aiChat.test.ts
 */
import { conditionList, type Problem } from "./problemBank";
import type { Moment } from "./process-summary";

export type AiChat = {
  id: number;
  userId: string;
  subject: string;
  problem: string;
  /** 기록 안의 질문 시각 (edit_log의 [시각, "q"]) */
  at: number | null;
  question: string;
  answer: string;
  /** 답에 나온 과정의 순간 ([[M3]] → 재생기의 그 시각) */
  moments: Moment[];
  flaggedBy: "student" | "teacher" | null;
  flagNote: string | null;
  createdAt: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export const MAX_QUESTION = 1000;
/** 학생 한 명이 하루에 물어볼 수 있는 횟수 (환경변수 AI_DAILY_LIMIT_PER_STUDENT로 바꿈) */
export const DEFAULT_DAILY_LIMIT = 50;
/** AI에 함께 보낼 이전 대화 수 (같은 문제, 최근 것부터) */
export const HISTORY_TURNS = 3;

export function dailyLimit(value = process.env.AI_DAILY_LIMIT_PER_STUDENT): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

export function validateQuestion(text: string): string | null {
  if (!text.trim()) return "궁금한 점을 적어 주세요.";
  if (text.length > MAX_QUESTION) return `질문은 ${MAX_QUESTION}자까지 쓸 수 있어요.`;
  return null;
}

/** 답에 실제로 나온 순간만 (저장·화면용). 없는 번호는 버린다 */
export function momentsUsed(answer: string, moments: Moment[]): Moment[] {
  const ids = new Set([...answer.matchAll(/\[\[(M\d+)\]\]/g)].map((m) => m[1]));
  return moments.filter((m) => ids.has(m.id));
}

/** 없는 순간 번호([[M99]])는 글에서 지운다 (AI가 번호를 지어냈을 때) */
export function dropUnknownRefs(answer: string, moments: Moment[]): string {
  const ids = new Set(moments.map((m) => m.id));
  return answer.replace(/\[\[(M\d+)\]\]/g, (all, id: string) => (ids.has(id) ? all : ""));
}

/** 한국 시간 오늘 0시 (ISO). 하루 질문 수를 셀 때 쓴다 */
export function kstDayStart(now = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
  return `${date}T00:00:00+09:00`;
}

/** 한국 시간 이번 달 1일 0시 (ISO) */
export function kstMonthStart(now = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
  return `${date.slice(0, 7)}-01T00:00:00+09:00`;
}

/**
 * 모델별 1백만 토큰당 가격(달러, 입력/출력). 교사 화면의 "예상 비용"에만 쓰는 어림값이다.
 * 정확한 금액은 Anthropic 콘솔(Usage)에서 확인한다. 모르는 모델이면 비용 대신 토큰 수만 보여 준다.
 */
const PRICES: [RegExp, number, number][] = [
  [/haiku-5-5/, 0.1, 0.5],
  [/sonnet-5/, 2, 10],
  [/opus-5-5/, 4, 20],
  [/opus-5(?!-5)/, 5, 25],
  [/haiku-4-5/, 1, 5],
];

export type Usage = { model: string | null; inputTokens: number | null; outputTokens: number | null };

/** 대화들의 예상 비용(달러). 가격을 모르는 모델이 섞이면 known=false */
export function estimateCost(rows: Usage[]): { dollars: number; known: boolean; inputTokens: number; outputTokens: number } {
  let dollars = 0;
  let known = true;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const r of rows) {
    const input = r.inputTokens ?? 0;
    const output = r.outputTokens ?? 0;
    inputTokens += input;
    outputTokens += output;
    const price = PRICES.find(([p]) => p.test(r.model ?? ""));
    if (!price) {
      if (input || output) known = false;
      continue;
    }
    dollars += (input * price[1] + output * price[2]) / 1_000_000;
  }
  return { dollars, known, inputTokens, outputTokens };
}

/** AI에 보낼 문제 설명 (제목·본문·조건·예시·목표). 시작 코드는 과정 요약에 들어가므로 뺀다 */
export function problemForAi(p: Pick<Problem, "number" | "title" | "description" | "conditions" | "examples" | "goal">): string {
  const lines = [`${p.number} ${p.title}`.trim()];
  if (p.description.trim()) lines.push("", p.description.trim());
  const conditions = conditionList(p.conditions);
  if (conditions.length) lines.push("", "조건:", ...conditions.map((c, i) => `${i + 1}. ${c}`));
  p.examples.forEach((e, i) => {
    lines.push("", `예시 ${i + 1}`);
    if (e.input) lines.push(`입력: ${e.input}`);
    lines.push(`출력:\n${e.output}`);
  });
  if (p.goal.trim()) lines.push("", `문제 목표: ${p.goal.trim()}`);
  return lines.join("\n").slice(0, 6000);
}

/* ───────── 답 검사: 정답 수준의 코드가 들어 있는지 ───────── */

/** 코드 블록(```) 안의 줄이 이만큼 이상이면 "완성 코드"로 본다 (짧은 문법 예시 1~2줄은 괜찮음) */
export const MAX_EXAMPLE_LINES = 2;

const FENCE = /```[^\n]*\n?([\s\S]*?)```/g;

/** 두 글의 비슷한 정도 (0~1, 편집 거리 기준) */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** 띄어쓰기 차이는 무시하고 비교한다 (`print( menu )`와 `print(menu)`는 같은 줄) */
const squash = (s: string) => s.replace(/\s+/g, "");

/** 답 속의 코드 조각: 코드 블록의 줄들과 `백틱` 조각 */
function codePieces(answer: string): { blockLines: string[]; pieces: string[] } {
  const blockLines: string[] = [];
  for (const m of answer.matchAll(FENCE)) blockLines.push(...m[1].split("\n").map(squash).filter(Boolean));
  const inline = [...answer.replace(FENCE, "").matchAll(/`([^`\n]+)`/g)].map((m) => squash(m[1]));
  return { blockLines, pieces: [...blockLines, ...inline] };
}

/**
 * 학생 코드의 한 줄을 "고친 버전"인지: 학생 줄과 거의 같지만, 학생이 쓴 줄(의 일부)은 아닌 코드.
 * 학생이 쓴 부분을 그대로 가리키는 것(예: 칭찬하며 `int(input())`을 짚기)은 괜찮다.
 */
function fixChecker(studentCode: string) {
  const lines = studentCode.split("\n").map(squash).filter((l) => l.length >= 5);
  return (piece: string) =>
    piece.length >= 5 && !lines.some((l) => l.includes(piece)) && lines.some((l) => similarity(piece, l) >= 0.75);
}

/**
 * AI 답이 정답을 대신 써 주는지 검사한다.
 * - 코드 블록이 3줄 이상 (완성 코드)
 * - 학생 코드의 한 줄을 "고친 버전"이 들어 있음 (거의 같지만 다른 줄 = 고칠 곳을 그대로 알려 줌)
 * studentCode에는 학생이 쓴 코드(지금 코드, 마지막 성공 코드)를 넣는다. 그 안에 있는 코드를 가리키는 것은 괜찮다.
 */
export function leaksAnswer(answer: string, studentCode: string): string | null {
  const { blockLines, pieces } = codePieces(answer);
  if (blockLines.length > MAX_EXAMPLE_LINES) return "완성 코드";
  const isFix = fixChecker(studentCode);
  return pieces.some(isFix) ? "고친 줄" : null;
}

/** 다시 물어도 걸리면: 코드 블록과 고친 줄을 지운다 (마지막 안전장치) */
export function stripAnswerCode(answer: string, studentCode: string): string {
  const isFix = fixChecker(studentCode);
  return answer
    .replace(FENCE, "(코드는 직접 써 보세요)")
    .replace(/`([^`\n]+)`/g, (all, code: string) => (isFix(squash(code)) ? "(이 부분은 직접 고쳐 보세요)" : all))
    .trim();
}

/** 모델별로 나눈 사용량 (콘솔 Usage 화면과 맞춰 볼 수 있게) */
export function usageByModel(rows: Usage[]) {
  const groups = new Map<string, Usage[]>();
  for (const r of rows) {
    const key = r.model ?? "(모름)";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([model, list]) => ({ model, count: list.length, ...estimateCost(list) }));
}
