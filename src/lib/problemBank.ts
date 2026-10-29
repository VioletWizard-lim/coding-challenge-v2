/**
 * 문제 관리: 교사가 올린 문제와 공개 시각. 브라우저·서버 모두 쓰는 순수 함수만 둔다.
 * (DB 읽기·쓰기는 problemStore.ts)
 */
import { SUBJECTS } from "./problems";

export type Example = { input: string; output: string };

/**
 * 문제 양식: 난이도(별 1~5) · 문제 · 조건 · 예시 · 문제 목표 · 도전 과제(단원 마지막 문제 등, 선택)
 */
export type Problem = {
  id: number | null;
  subject: string;
  /** "2-3" 형식 */
  number: string;
  title: string;
  /** 별 1~5. 정하지 않았으면 null */
  difficulty: number | null;
  /** 문제 본문 */
  description: string;
  /** 조건: 한 줄에 하나씩 */
  conditions: string;
  /** 예시: 입력(없어도 됨)과 출력 */
  examples: Example[];
  /** 문제 목표 */
  goal: string;
  /** 도전 과제 (선택) */
  challenge: string;
  starterCode: string;
  /** 공개 시각(ISO). null이면 비공개 */
  openAt: string | null;
};

export const MAX_EXAMPLES = 10;

/** 조건 글을 줄 단위 목록으로 (빈 줄, 앞의 "-", "•", "1." 같은 표시는 뺀다) */
export const conditionList = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim().replace(/^([-•*·]|\d+[.)])\s*/, ""))
    .filter(Boolean);

/** DB의 examples 값(jsonb)을 안전하게 읽는다 */
export function parseExamples(value: unknown): Example[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e) => e && typeof e === "object")
    .map((e) => ({ input: String((e as Example).input ?? ""), output: String((e as Example).output ?? "") }))
    .filter((e) => e.input || e.output);
}

export const NUMBER_PATTERN = /^\d{1,2}-\d{1,2}$/;

/** "2-10"이 "2-9" 뒤에 오도록 번호를 숫자로 비교 */
export function compareNumber(a: string, b: string) {
  const [a1, a2] = a.split("-").map(Number);
  const [b1, b2] = b.split("-").map(Number);
  return a1 - b1 || a2 - b2 || a.localeCompare(b);
}

export const sortProblems = (list: Problem[]) =>
  [...list].sort((a, b) => a.subject.localeCompare(b.subject) || compareNumber(a.number, b.number));

export const isOpen = (p: Pick<Problem, "openAt">, now: Date) => p.openAt !== null && new Date(p.openAt) <= now;

/** problems 표가 아직 없을 때(마이그레이션 전) 쓰는, 코드에 들어 있는 문제 목록. 모두 공개 상태 */
export function staticProblems(): Problem[] {
  return Object.entries(SUBJECTS).flatMap(([subject, list]) =>
    Object.entries(list).map(([number, title]) => ({
      id: null,
      subject,
      number,
      title,
      difficulty: null,
      description: "",
      conditions: "",
      examples: [],
      goal: "",
      challenge: "",
      starterCode: "",
      openAt: "1970-01-01T00:00:00.000Z",
    })),
  );
}

/** 문제 이름: 제목이 번호와 같으면 "2-3", 아니면 "2-3. 제목" */
export const labelOf = (p: Pick<Problem, "number" | "title">) =>
  !p.title || p.title === p.number ? p.number : `${p.number}. ${p.title}`;

export type ProblemInput = Omit<Problem, "id">;

/** 교사가 보낸 문제를 검사한다. 잘못된 점이 있으면 안내 문구, 없으면 null */
export function validateProblem(p: ProblemInput): string | null {
  if (!(p.subject in SUBJECTS)) return "과목을 고르세요.";
  if (!NUMBER_PATTERN.test(p.number)) return "번호는 '2-3'처럼 단원-번호로 적어 주세요.";
  if (!p.title.trim()) return "제목을 적어 주세요.";
  if (p.title.length > 100) return "제목이 너무 길어요 (100자까지).";
  if (p.difficulty !== null && !(Number.isInteger(p.difficulty) && p.difficulty >= 1 && p.difficulty <= 5)) {
    return "난이도는 별 1~5개 중에서 골라 주세요.";
  }
  for (const [text, name] of [
    [p.description, "문제"],
    [p.conditions, "조건"],
    [p.goal, "문제 목표"],
    [p.challenge, "도전 과제"],
  ] as const) {
    if (text.length > 20_000) return `${name}이(가) 너무 길어요.`;
  }
  if (p.examples.length > MAX_EXAMPLES) return `예시는 ${MAX_EXAMPLES}개까지 넣을 수 있어요.`;
  if (p.examples.some((e) => e.input.length > 5000 || e.output.length > 5000)) return "예시가 너무 길어요.";
  if (p.starterCode.length > 20_000) return "시작 코드가 너무 길어요.";
  if (p.openAt !== null && Number.isNaN(new Date(p.openAt).getTime())) return "공개 시각이 올바르지 않아요.";
  return null;
}

/** 교사 화면에 보일 공개 상태 */
export function openStatus(p: Pick<Problem, "openAt">, now: Date): { kind: "open" | "scheduled" | "hidden"; text: string } {
  if (p.openAt === null) return { kind: "hidden", text: "비공개" };
  const at = new Date(p.openAt);
  if (at <= now) return { kind: "open", text: "공개됨" };
  const text = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return { kind: "scheduled", text: `${text} 공개 예정` };
}
