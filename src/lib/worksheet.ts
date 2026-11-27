/**
 * 학습지(PDF·사진·docx)에서 AI가 뽑은 문제를 우리 문제 형식으로 바꾼다. AI 호출은 ai.ts, 여기는 순수 함수만.
 */
import { MAX_EXAMPLES, NUMBER_PATTERN, type Example, type ProblemInput } from "./problemBank";
import { lessonDefaults, MAX_LESSON, MAX_LESSON_ORDER, parseStandards } from "./standards";

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
          lesson: { type: "integer", description: "'차시' 칸의 숫자 (예: '2차시' → 2). 없으면 0" },
          lesson_order: { type: "integer", description: "'차시 안 순서' 칸의 숫자 (예: '1번' → 1). 없으면 0" },
          level: { type: "string", enum: ["기본", "심화", ""], description: "'기본/심화' 칸. 없으면 빈 문자열" },
          anchor: { type: "boolean", description: "'앵커(기준 문제)' 칸이 O·예·앵커처럼 표시되어 있으면 true, 비었거나 X면 false" },
          standards: { type: "array", items: { type: "string" }, description: "'성취기준' 칸의 코드들 그대로 (예: \"12정03-04\"). 없으면 빈 배열" },
        },
        required: ["number", "title", "difficulty", "description", "conditions", "examples", "goal", "challenge", "lesson", "lesson_order", "level", "anchor", "standards"],
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
      ...lessonFields(p),
    };
  });
}

const smallInt = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
};

/**
 * 수업 계획 칸(차시·순서·기본/심화·앵커·성취기준). 학습지에 차시가 없으면 차시·순서·기본/심화·앵커는 정하지 않음(undefined) →
 * 이미 있는 문제의 값을 지킨다. 성취기준은 적혀 있을 때만.
 */
function lessonFields(p: Record<string, unknown>): Pick<ExtractedProblem, "lesson" | "lessonOrder" | "level" | "anchor" | "standards"> {
  const codes = parseStandards((Array.isArray(p.standards) ? p.standards : []).map(String).join(" ")).codes;
  const lesson = smallInt(p.lesson, MAX_LESSON);
  const out: Pick<ExtractedProblem, "lesson" | "lessonOrder" | "level" | "anchor" | "standards"> = codes.length ? { standards: codes } : {};
  if (lesson === null) return out;
  return {
    ...out,
    lesson,
    lessonOrder: smallInt(p.lesson_order, MAX_LESSON_ORDER),
    level: p.level === "기본" || p.level === "심화" ? p.level : null,
    anchor: p.anchor === true,
  };
}

/**
 * 차시·순서만 적은 문제는 문제 양식과 같은 규칙으로 미리 채운다 (standards.ts lessonDefaults):
 * 성취기준이 비었으면 차시의 성취기준, 기본/심화가 비었으면 순서로, 그 차시에 앵커 표시가 하나도 없으면 마지막 순서를 앵커로.
 * others: 같은 과목에 이미 있는 문제 (같은 차시의 순서를 함께 센다)
 */
export function fillLessonDefaults(
  problems: ExtractedProblem[],
  others: { subject: string; number: string; lesson?: number | null; lessonOrder?: number | null }[] = [],
): ExtractedProblem[] {
  return problems.map((p) => {
    if (!p.lesson || !p.lessonOrder) return p;
    const same = (q: { subject: string; lesson?: number | null }) => q.subject === p.subject && q.lesson === p.lesson;
    const orders = [
      ...problems.filter((q) => q !== p && same(q)).map((q) => q.lessonOrder),
      ...others.filter((q) => same(q) && !problems.some((x) => x.subject === q.subject && x.number === q.number)).map((q) => q.lessonOrder),
    ].filter((n): n is number => !!n);
    const d = lessonDefaults(p.lesson, p.lessonOrder, orders);
    const anchorMarked = problems.some((q) => same(q) && q.anchor);
    return {
      ...p,
      standards: p.standards?.length ? p.standards : d.standards,
      level: p.level ?? d.level,
      anchor: anchorMarked ? !!p.anchor : d.anchor,
    };
  });
}

/** 번호가 올바른 문제만 세기 (안내 문구용) */
export const validNumberCount = (list: ExtractedProblem[]) => list.filter((p) => NUMBER_PATTERN.test(p.number)).length;

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** 서버로 보내는 파일 형식 (docx는 브라우저에서 글만 뽑아 보낸다) */
export const WORKSHEET_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export type WorksheetType = (typeof WORKSHEET_TYPES)[number] | typeof DOCX_TYPE;
export const WORKSHEET_ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.webp," + [...WORKSHEET_TYPES, DOCX_TYPE].join(",");

/** 한 번에 보내는 양: Vercel 요청 한도(4.5MB)보다 조금 작게. 파일은 어디에도 저장하지 않는다 */
export const MAX_WORKSHEET_BYTES = 4 * 1024 * 1024;
export const MAX_WORKSHEET_FILES = 10;
/** docx에서 뽑은 글은 모두 합쳐 이만큼까지 */
export const MAX_WORKSHEET_TEXT = 300_000;

/** 브라우저가 알려 주는 파일 형식이 비어 있을 때(일부 docx 등) 확장자로 정한다 */
export function worksheetType(name: string, type: string): WorksheetType | null {
  if (([...WORKSHEET_TYPES, DOCX_TYPE] as string[]).includes(type)) return type as WorksheetType;
  const ext = name.toLowerCase().split(".").pop();
  const byExt: Record<string, WorksheetType> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    docx: DOCX_TYPE,
  };
  return (ext && byExt[ext]) || null;
}

/** 파일 앞부분(매직 넘버)이 형식과 맞는지 (확장자만 바꾼 파일 걸러내기) */
export function looksLike(type: WorksheetType, head: Uint8Array): boolean {
  const starts = (...b: number[]) => b.every((v, i) => head[i] === v);
  if (type === "application/pdf") return starts(0x25, 0x50, 0x44, 0x46); // %PDF
  if (type === DOCX_TYPE) return starts(0x50, 0x4b); // zip
  if (type === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (type === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  return starts(0x52, 0x49, 0x46, 0x46); // webp: RIFF
}

/** docx를 바꾼 HTML에서 그림을 빼고 공백을 줄인다 (표 구조는 남겨 AI가 칸을 알아보게) */
export function cleanDocxHtml(html: string): string {
  return html
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<a id="[^"]*"><\/a>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── 학습지 읽기 진행 게이지 ── */

/** sending: 파일을 보내는 중 / reading: AI가 학습지를 읽는 중(생각) / writing: 문제를 옮겨 적는 중 */
export type WorksheetStage = "sending" | "reading" | "writing";

/** 서버 → 브라우저로 한 줄씩 보내는 진행 상황 (NDJSON) */
export type WorksheetLine =
  | { type: "progress"; stage: WorksheetStage; found: number; chars: number }
  | { type: "done"; problems: ExtractedProblem[] }
  | { type: "error"; message: string };

/** 지금까지 받은 JSON 글에서 옮겨 적기 시작한 문제 수 ("number" 칸 개수) */
export const countFoundProblems = (partialJson: string) => (partialJson.match(/"number"\s*:/g) ?? []).length;

/**
 * 게이지 위치(0~100). 전체 문제 수는 끝나야 알 수 있어서 어림값이다:
 * 보내는 중 5% → 읽는 중 10~40% (시간이 갈수록 천천히) → 옮겨 적는 중 40~95% (적은 글자가 늘수록 천천히) → 끝나면 100%
 */
export function gaugePercent(stage: WorksheetStage, stageMs: number, chars: number): number {
  if (stage === "sending") return 5;
  if (stage === "reading") return Math.round(10 + 30 * (1 - Math.exp(-stageMs / 40_000)));
  return Math.round(40 + 55 * (1 - Math.exp(-chars / 8_000)));
}
