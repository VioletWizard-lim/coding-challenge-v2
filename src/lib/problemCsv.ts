/**
 * 문제 일괄 등록: 문제 목록 ↔ CSV.
 * 교사는 "지금 문제 내려받기"로 받은 파일을 엑셀에서 고쳐 다시 올린다 (내려받은 파일이 곧 양식).
 * 미리보기와 실제 반영이 같은 함수를 써서 결과가 어긋나지 않게 한다.
 */
import { compareNumber, validateProblem, type Example, type Problem, type ProblemInput } from "./problemBank";
import { parseCsv } from "./studentCsv";
import { MAX_LESSON, MAX_LESSON_ORDER, parseStandards, type Level } from "./standards";

export const MAX_PROBLEM_ROWS = 300;
/** CSV에 넣는 예시 칸 수 (화면에서는 10개까지 넣을 수 있지만 엑셀이 너무 넓어지지 않게) */
export const CSV_EXAMPLES = 5;

const BASE_HEADERS = ["과목", "번호", "제목", "난이도", "차시", "차시 안 순서", "기본/심화", "앵커", "성취기준", "문제", "조건"];
// 수업 계획 칸(차시~성취기준, 025): 파일에 이 칸이 없으면 그 값은 바꾸지 않는다 (예전 양식 파일을 올려도 기존 값을 지킴)
const EXAMPLE_HEADERS = Array.from({ length: CSV_EXAMPLES }, (_, i) => [
  `예시${i + 1} 입력`,
  `예시${i + 1} 출력`,
]).flat();
const TAIL_HEADERS = ["문제 목표", "도전 과제", "시작 코드", "공개"];
export const PROBLEM_HEADERS = [...BASE_HEADERS, ...EXAMPLE_HEADERS, ...TAIL_HEADERS];

/** 공개 칸: "공개" / "비공개"(또는 빈칸) / "2026-11-03 09:00"(한국 시간) */
export type OpenValue = { kind: "open" } | { kind: "hidden" } | { kind: "at"; iso: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 시각 → "2026-11-03 09:00" (한국 시간) */
export function toKstText(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 공개 칸 읽기. 알아볼 수 없으면 null */
export function parseOpen(text: string): OpenValue | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || t === "비공개") return { kind: "hidden" };
  if (["공개", "바로", "바로 공개", "공개됨"].includes(t)) return { kind: "open" };
  const m = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return { kind: "at", iso: new Date(Date.UTC(y, mo - 1, d, h - 9, mi)).toISOString() };
}

/** 차시·순서 칸: 빈칸이면 null, 1~max 정수가 아니면 NaN */
export function parseSmallInt(text: string, max: number): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = /^\d{1,2}$/.test(t) ? Number(t) : NaN;
  return n >= 1 && n <= max ? n : NaN;
}

/** 앵커 칸: "O"·"○"·"예"·"앵커" → true, 빈칸·"X"·"아니오" → false, 그 밖은 null */
export function parseAnchor(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (!t || ["x", "×", "아니오", "아니요", "no", "n", "false", "0", "-"].includes(t)) return false;
  if (["o", "○", "◯", "●", "예", "네", "앵커", "기준", "yes", "y", "true", "1", "v", "✔"].includes(t)) return true;
  return null;
}

/** 난이도 칸: "3" 또는 "★★★". 빈칸이면 null, 알아볼 수 없으면 NaN */
export function parseDifficulty(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^★+$/.test(t)) return t.length;
  return /^\d$/.test(t) ? Number(t) : NaN;
}

const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** 문제 목록 → CSV 글 (BOM은 내려받을 때 붙인다) */
export function problemsToCsv(problems: Problem[], now: Date): string {
  const rows = [...problems]
    .sort((a, b) => a.subject.localeCompare(b.subject) || compareNumber(a.number, b.number))
    .map((p) => {
      const open = p.openAt === null ? "비공개" : new Date(p.openAt) <= now ? "공개" : toKstText(p.openAt);
      const examples = Array.from({ length: CSV_EXAMPLES }, (_, i) => [
        p.examples[i]?.input ?? "",
        p.examples[i]?.output ?? "",
      ]).flat();
      return [
        p.subject,
        p.number,
        p.title === p.number ? "" : p.title,
        p.difficulty ? String(p.difficulty) : "",
        p.lesson ? String(p.lesson) : "",
        p.lessonOrder ? String(p.lessonOrder) : "",
        p.level ?? "",
        p.anchor ? "O" : "",
        (p.standards ?? []).join(" "),
        p.description,
        p.conditions,
        ...examples,
        p.goal,
        p.challenge,
        p.starterCode,
        open,
      ];
    });
  return [PROBLEM_HEADERS, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export type ParsedProblem = {
  line: number;
  /** openAt 대신 공개 칸 값 (이미 공개된 문제를 "공개"로 두면 처음 공개 시각을 지키려고 서버에서 정한다) */
  input: Omit<ProblemInput, "openAt">;
  open: OpenValue;
  error: string | null;
};

/** CSV 글 → 문제 목록. 줄마다 잘못된 점을 찾는다 */
export function parseProblemCsv(text: string): { rows: ParsedProblem[]; error: string | null } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], error: "파일이 비어 있어요." };
  const norm = (h: string) => h.replace(/\s/g, "");
  const header = table[0].map(norm);
  const col = (name: string) => header.indexOf(norm(name));
  if (col("과목") < 0 || col("번호") < 0 || col("제목") < 0) {
    return {
      rows: [],
      error: "첫 줄에 '과목', '번호', '제목' 제목이 있어야 해요. '문제 내려받기'로 받은 파일을 고쳐서 올려 주세요.",
    };
  }
  if (table.length - 1 > MAX_PROBLEM_ROWS)
    return { rows: [], error: `한 번에 ${MAX_PROBLEM_ROWS}문제까지 올릴 수 있어요.` };

  const seen = new Set<string>();
  const rows = table.slice(1).map((cells, i): ParsedProblem => {
    // 엑셀이 줄바꿈을 \r\n으로 저장하는 경우가 있어 \n으로 맞춘다
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").replace(/\r\n?/g, "\n") : "");
    const examples: Example[] = [];
    for (let n = 1; n <= CSV_EXAMPLES; n++) {
      const input = get(`예시${n} 입력`).replace(/\s+$/, "");
      const output = get(`예시${n} 출력`).replace(/\s+$/, "");
      if (input || output) examples.push({ input, output });
    }
    const number = get("번호").trim();
    const difficulty = parseDifficulty(get("난이도"));
    const open = parseOpen(get("공개"));
    // 수업 계획 칸: 파일에 있는 칸만 읽는다
    const has = (name: string) => col(name) >= 0;
    const lesson = has("차시") ? parseSmallInt(get("차시"), MAX_LESSON) : undefined;
    const lessonOrder = has("차시 안 순서") ? parseSmallInt(get("차시 안 순서"), MAX_LESSON_ORDER) : undefined;
    const levelText = get("기본/심화").trim();
    const level: Level | null | undefined | "bad" = !has("기본/심화")
      ? undefined
      : !levelText
        ? null
        : levelText === "기본" || levelText === "심화"
          ? levelText
          : "bad";
    const anchor = has("앵커") ? parseAnchor(get("앵커")) : undefined;
    const standards = has("성취기준") ? parseStandards(get("성취기준")) : undefined;
    const lessonInput = {
      ...(lesson !== undefined && !Number.isNaN(lesson) ? { lesson } : {}),
      ...(lessonOrder !== undefined && !Number.isNaN(lessonOrder) ? { lessonOrder } : {}),
      ...(level !== undefined && level !== "bad" ? { level } : {}),
      ...(anchor !== undefined && anchor !== null ? { anchor } : {}),
      ...(standards ? { standards: standards.codes } : {}),
    };
    const input = {
      subject: get("과목").trim(),
      number,
      title: get("제목").trim() || number,
      difficulty: Number.isNaN(difficulty) ? null : difficulty,
      description: get("문제").trim(),
      conditions: get("조건").trim(),
      examples,
      goal: get("문제 목표").trim(),
      challenge: get("도전 과제").trim(),
      starterCode: get("시작 코드"),
      ...lessonInput,
    };
    const key = `${input.subject}_${number}`;
    let error: string | null = null;
    if (Number.isNaN(difficulty)) error = "난이도는 1~5 숫자나 ★로 적어 주세요.";
    else if (Number.isNaN(lesson)) error = `차시는 1~${MAX_LESSON} 사이 숫자로 적어 주세요.`;
    else if (Number.isNaN(lessonOrder)) error = `차시 안 순서는 1~${MAX_LESSON_ORDER} 사이 숫자로 적어 주세요.`;
    else if (level === "bad") error = "기본/심화 칸에는 '기본'이나 '심화'를 적어 주세요.";
    else if (anchor === null) error = "앵커 칸에는 O(기준 문제) 또는 빈칸을 적어 주세요.";
    else if (standards?.bad.length) error = `모르는 성취기준이 있어요: ${standards.bad.join(", ")} (예: 12정03-04)`;
    else if (!open) error = "공개 칸은 '공개', '비공개', 또는 '2026-11-03 09:00'처럼 적어 주세요.";
    else if (seen.has(key)) error = "파일 안에 같은 과목·번호가 또 있어요.";
    else error = validateProblem({ ...input, openAt: null });
    seen.add(key);
    return { line: i + 2, input, open: open ?? { kind: "hidden" }, error };
  });
  return { rows, error: rows.length ? null : "문제 줄이 없어요." };
}

/** 공개 칸 값을 실제 공개 시각으로: "공개"인데 이미 공개된 문제면 처음 공개 시각을 그대로 둔다 */
export function resolveOpenAt(open: OpenValue, existing: Problem | undefined, now: Date): string | null {
  if (open.kind === "hidden") return null;
  if (open.kind === "at") {
    // 파일에는 분까지만 적히므로, 같은 분이면 원래 시각을 그대로 둔다 (내려받고 그대로 올려도 "고침"이 안 되게)
    const sameMinute =
      existing?.openAt &&
      Math.floor(Date.parse(existing.openAt) / 60_000) === Math.floor(Date.parse(open.iso) / 60_000);
    return sameMinute ? existing.openAt : open.iso;
  }
  if (existing?.openAt && new Date(existing.openAt) <= now) return existing.openAt;
  return now.toISOString();
}

const FIELD_NAMES: [keyof ProblemInput, string][] = [
  ["title", "제목"],
  ["difficulty", "난이도"],
  ["description", "문제"],
  ["conditions", "조건"],
  ["examples", "예시"],
  ["goal", "문제 목표"],
  ["challenge", "도전 과제"],
  ["starterCode", "시작 코드"],
  ["openAt", "공개"],
  ["lesson", "차시"],
  ["lessonOrder", "차시 안 순서"],
  ["level", "기본/심화"],
  ["anchor", "앵커"],
  ["standards", "성취기준"],
];

/** 기존 문제와 비교해 바뀌는 칸 이름들 (next에서 정하지 않은 칸(undefined)은 바뀌지 않음) */
export function changedFields(existing: Problem, next: ProblemInput): string[] {
  // 앵커 없음(false)과 성취기준 없음([])은 "정하지 않음"과 같게 본다
  const same = (k: keyof ProblemInput, v: unknown) => (k === "anchor" ? !!v : k === "standards" ? (v ?? []) : (v ?? null));
  return FIELD_NAMES.filter(
    ([k]) => next[k] !== undefined && JSON.stringify(same(k, existing[k])) !== JSON.stringify(same(k, next[k])),
  ).map(([, name]) => name);
}

/** 수업 계획 칸(025)이 DB에 없을 때: 그 값은 비교·저장하지 않는다 */
export function withoutLesson<T extends Partial<ProblemInput>>(p: T): T {
  const rest = { ...p };
  for (const k of ["standards", "level", "lesson", "lessonOrder", "anchor"] as const) delete rest[k];
  return rest;
}
