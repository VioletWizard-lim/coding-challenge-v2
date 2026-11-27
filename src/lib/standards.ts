/**
 * 2022 개정 교육과정 정보 [12정03] 문제 해결과 프로그래밍 성취기준과, 2027년 3~4월 수업 차시 계획(작업 지시서 5절).
 * 수업 문제에 성취기준·차시·차시 안 순서·기본/심화·앵커를 붙이는 데 쓴다 (problems 표 025). 순수 함수만 — 단위 테스트: standards.test.ts
 */

export type Standard = { code: string; short: string; text: string; main: boolean };

/** 성취기준 원문 (교육과정 그대로). main: 이번 연구 수업에서 주로 쓰는 것 */
export const STANDARDS: Standard[] = [
  { code: "12정03-01", short: "문제 분해·모델링", text: "복잡한 문제를 해결 가능한 작은 문제로 분해하고 모델링한다.", main: true },
  { code: "12정03-02", short: "정렬 알고리즘", text: "데이터를 정렬하는 다양한 알고리즘의 특징과 효율을 비교·분석한다.", main: false },
  { code: "12정03-03", short: "탐색 알고리즘", text: "데이터를 탐색하는 다양한 알고리즘의 특징과 효율을 비교·분석한다.", main: false },
  { code: "12정03-04", short: "자료형", text: "자료형의 종류와 특성을 알고, 적합한 자료형을 선택하여 프로그램을 작성한다.", main: true },
  { code: "12정03-05", short: "표준입출력·파일 입출력", text: "표준입출력과 파일 입출력을 활용한 프로그램을 작성한다.", main: true },
  { code: "12정03-06", short: "다차원 데이터 구조", text: "다차원 데이터 구조를 활용한 프로그램을 작성한다.", main: true },
  { code: "12정03-07", short: "제어 구조 복합 활용", text: "다양한 제어 구조를 복합적으로 활용한 프로그램을 작성한다.", main: true },
  { code: "12정03-08", short: "클래스와 인스턴스", text: "객체를 구현하는 클래스와 인스턴스를 활용하여 프로그램을 작성한다.", main: false },
  { code: "12정03-09", short: "협력적 설계·구현", text: "실생활 및 다양한 학문 분야의 문제 해결을 위한 프로그램을 협력적으로 설계·구현한다.", main: false },
  { code: "12정03-10", short: "성능 평가·공유", text: "문제 해결을 위한 프로그램의 성능을 평가하고 공유한다.", main: false },
];

const CODES = new Set(STANDARDS.map((s) => s.code));
export const MAX_STANDARDS = 5;
export const MAX_LESSON = 30;
export const MAX_LESSON_ORDER = 20;
export const LEVELS = ["기본", "심화"] as const;
export type Level = (typeof LEVELS)[number];

export const standardOf = (code: string) => STANDARDS.find((s) => s.code === code) ?? null;
/** "[12정03-04] 자료형" */
export const standardLabel = (code: string) => `[${code}] ${standardOf(code)?.short ?? ""}`.trim();

/**
 * 차시 → 성취기준 (수업 계획: 1 도입·사전 설문 / 2 자료형 / 3 입출력 / 4 리스트 / 5 조건문 / 6 반복문 / 7 제어 구조 복합 / 8 문제 분해·설계).
 * 문제에 차시를 적으면 이 성취기준이 미리 채워진다 (문제마다 고칠 수 있음). 조건문·반복문은 [12정03-07] 제어 구조.
 */
export const LESSON_STANDARDS: Record<number, string[]> = {
  2: ["12정03-04"],
  3: ["12정03-05"],
  4: ["12정03-06"],
  5: ["12정03-07"],
  6: ["12정03-07"],
  7: ["12정03-07"],
  8: ["12정03-01"],
};

/** 성취기준 칸 읽기: "12정03-04, [12정03-05]" 또는 "04 05". 모르는 코드는 bad로 */
export function parseStandards(text: string): { codes: string[]; bad: string[] } {
  const codes: string[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[,\s/]+/).map((x) => x.replace(/[[\]]/g, "").trim()).filter(Boolean)) {
    const code = /^\d{1,2}$/.test(raw) ? `12정03-${raw.padStart(2, "0")}` : raw;
    if (CODES.has(code)) {
      if (!codes.includes(code)) codes.push(code);
    } else bad.push(raw);
  }
  return { codes: codes.sort(), bad };
}

/** 성취기준 목록 검사: 잘못이 있으면 안내, 없으면 null */
export function validateStandards(codes: unknown): string | null {
  if (!Array.isArray(codes)) return "성취기준을 다시 골라 주세요.";
  if (codes.length > MAX_STANDARDS) return `성취기준은 ${MAX_STANDARDS}개까지 붙일 수 있어요.`;
  if (codes.some((c) => typeof c !== "string" || !CODES.has(c))) return "모르는 성취기준이 있어요.";
  return null;
}

/**
 * 차시와 순서를 넣었을 때 미리 채울 값 (수업 계획 5절):
 * - 성취기준: LESSON_STANDARDS
 * - 기본/심화: 차시에 3문제 이하면 1번만 기본, 4문제 이상이면 1·2번이 기본, 나머지는 심화
 * - 앵커(기준 문제): 차시의 마지막(가장 어려운) 문제
 * @param orders 같은 과목·같은 차시의 다른 문제들의 순서 (이 문제 제외)
 */
export function lessonDefaults(lesson: number, order: number, orders: number[]): { standards: string[]; level: Level; anchor: boolean } {
  const all = [...new Set([...orders, order])];
  const basics = all.length >= 4 ? 2 : 1;
  return {
    standards: LESSON_STANDARDS[lesson] ?? [],
    level: order <= basics ? "기본" : "심화",
    anchor: order === Math.max(...all),
  };
}

/** 성취기준별 보기 한 줄 */
export type StandardSummary = {
  code: string;
  /** 이 성취기준이 붙은 문제 번호들 (번호 순은 부르는 쪽에서) */
  problems: string[];
  anchors: string[];
  /** 이 문제들을 한 번이라도 낸 학생 수 */
  students: number;
  submissions: number;
};

/**
 * 성취기준마다 문제 수·앵커·낸 학생 수·제출 수 (통과율은 P5 연구 지표에서).
 * 성취기준이 하나도 없는 문제는 code ""로 따로 모은다.
 */
export function standardSummary(
  problems: { number: string; standards?: string[]; anchor?: boolean }[],
  subs: { problem: string; student: string }[],
): StandardSummary[] {
  const byProblem = new Map<string, { students: Set<string>; count: number }>();
  for (const s of subs) {
    const e = byProblem.get(s.problem) ?? { students: new Set<string>(), count: 0 };
    e.students.add(s.student);
    e.count++;
    byProblem.set(s.problem, e);
  }
  const codes = [...STANDARDS.map((s) => s.code), ""];
  return codes
    .map((code) => {
      const mine = problems.filter((p) => (code ? (p.standards ?? []).includes(code) : !(p.standards ?? []).length));
      const students = new Set<string>();
      let submissions = 0;
      for (const p of mine) {
        const e = byProblem.get(p.number);
        if (!e) continue;
        e.students.forEach((x) => students.add(x));
        submissions += e.count;
      }
      return {
        code,
        problems: mine.map((p) => p.number),
        anchors: mine.filter((p) => p.anchor).map((p) => p.number),
        students: students.size,
        submissions,
      };
    })
    .filter((r) => r.problems.length > 0);
}
