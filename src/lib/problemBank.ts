/**
 * 문제 관리: 교사가 올린 문제와 공개 시각. 브라우저·서버 모두 쓰는 순수 함수만 둔다.
 * (DB 읽기·쓰기는 problemStore.ts)
 */
import { SUBJECTS } from "./problems";

export type Problem = {
  id: number | null;
  subject: string;
  /** "2-3" 형식 */
  number: string;
  title: string;
  description: string;
  starterCode: string;
  /** 공개 시각(ISO). null이면 비공개 */
  openAt: string | null;
};

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
      description: "",
      starterCode: "",
      openAt: "1970-01-01T00:00:00.000Z",
    })),
  );
}

/** 문제 이름: 제목이 번호와 같으면 "2-3", 아니면 "2-3. 제목" */
export const labelOf = (p: Pick<Problem, "number" | "title">) =>
  !p.title || p.title === p.number ? p.number : `${p.number}. ${p.title}`;

export type ProblemInput = {
  subject: string;
  number: string;
  title: string;
  description: string;
  starterCode: string;
  openAt: string | null;
};

/** 교사가 보낸 문제를 검사한다. 잘못된 점이 있으면 안내 문구, 없으면 null */
export function validateProblem(p: ProblemInput): string | null {
  if (!(p.subject in SUBJECTS)) return "과목을 고르세요.";
  if (!NUMBER_PATTERN.test(p.number)) return "번호는 '2-3'처럼 단원-번호로 적어 주세요.";
  if (!p.title.trim()) return "제목을 적어 주세요.";
  if (p.title.length > 100) return "제목이 너무 길어요 (100자까지).";
  if (p.description.length > 20_000) return "문제 설명이 너무 길어요.";
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
