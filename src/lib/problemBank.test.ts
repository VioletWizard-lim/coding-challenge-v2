import { describe, expect, it } from "vitest";
import {
  compareNumber,
  conditionList,
  parseExamples,
  isOpen,
  labelOf,
  openStatus,
  sortProblems,
  staticProblems,
  validateProblem,
  type Problem,
} from "./problemBank";

const p = (over: Partial<Problem>): Problem => ({
  id: 1,
  subject: "프로그래밍",
  number: "1-1",
  title: "제목",
  difficulty: null,
  description: "",
  conditions: "",
  examples: [],
  goal: "",
  challenge: "",
  starterCode: "",
  openAt: null,
  ...over,
});

describe("문제 번호 정렬", () => {
  it("2-10이 2-9 뒤, 10-1이 9-3 뒤", () => {
    expect(["2-10", "10-1", "2-9", "9-3", "1-1"].sort(compareNumber)).toEqual(["1-1", "2-9", "2-10", "9-3", "10-1"]);
    expect(sortProblems([p({ subject: "정보", number: "1-1" }), p({ number: "2-1" })]).map((x) => x.subject)).toEqual([
      "정보",
      "프로그래밍",
    ]);
  });
});

describe("공개 시각", () => {
  const now = new Date("2026-10-29T00:00:00Z");
  it("비어 있으면 비공개, 지난 시각이면 공개, 앞으로면 예정", () => {
    expect(isOpen(p({ openAt: null }), now)).toBe(false);
    expect(isOpen(p({ openAt: "2026-10-28T23:59:59Z" }), now)).toBe(true);
    expect(isOpen(p({ openAt: "2026-10-29T00:00:00Z" }), now)).toBe(true);
    expect(isOpen(p({ openAt: "2026-10-29T00:00:01Z" }), now)).toBe(false);
  });
  it("교사 화면 상태 문구 (한국 시간)", () => {
    expect(openStatus(p({ openAt: null }), now)).toEqual({ kind: "hidden", text: "비공개" });
    expect(openStatus(p({ openAt: "2026-10-01T00:00:00Z" }), now).text).toBe("공개됨");
    const s = openStatus(p({ openAt: "2026-10-30T00:00:00Z" }), now); // 한국 30일 9시
    expect(s.kind).toBe("scheduled");
    expect(s.text).toMatch(/10월 30일.*09:00 공개 예정/);
  });
});

describe("검사", () => {
  const ok = {
    subject: "프로그래밍",
    number: "2-3",
    title: "용돈",
    difficulty: 3,
    description: "",
    conditions: "",
    examples: [],
    goal: "",
    challenge: "",
    starterCode: "",
    openAt: null,
  };
  it("올바른 문제는 통과", () => expect(validateProblem(ok)).toBeNull());
  it.each([
    [{ subject: "국어" }, "과목"],
    [{ number: "2.3" }, "단원-번호"],
    [{ number: "" }, "단원-번호"],
    [{ title: "  " }, "제목"],
    [{ openAt: "아무거나" }, "공개 시각"],
    [{ difficulty: 6 }, "난이도"],
    [{ difficulty: 0 }, "난이도"],
    [{ examples: Array.from({ length: 11 }, () => ({ input: "", output: "1" })) }, "10개"],
  ])("%o → 안내", (over, msg) => expect(validateProblem({ ...ok, ...over })).toContain(msg));
});

it("문제 이름과 코드에 든 문제 목록", () => {
  expect(labelOf({ number: "1-1", title: "인사" })).toBe("1-1. 인사");
  expect(labelOf({ number: "1-1", title: "1-1" })).toBe("1-1");
  const list = staticProblems();
  expect(list.length).toBe(80);
  expect(list.every((x) => isOpen(x, new Date()))).toBe(true);
});

describe("조건·예시 읽기", () => {
  it("조건은 줄마다 하나, 앞의 표시는 뺀다", () => {
    expect(conditionList("- input()을 쓸 것\n\n• print는 한 번만\n2) 변수 이름은 영어로\n  그냥 줄  ")).toEqual([
      "input()을 쓸 것",
      "print는 한 번만",
      "변수 이름은 영어로",
      "그냥 줄",
    ]);
  });
  it("예시 jsonb를 안전하게 읽는다", () => {
    expect(parseExamples([{ input: "3", output: "9" }, { output: "안녕" }, null, { input: "", output: "" }, "x"])).toEqual([
      { input: "3", output: "9" },
      { input: "", output: "안녕" },
    ]);
    expect(parseExamples(null)).toEqual([]);
  });
});
