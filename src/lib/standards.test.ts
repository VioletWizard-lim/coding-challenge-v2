import { describe, expect, it } from "vitest";
import { lessonDefaults, parseStandards, standardLabel, STANDARDS, standardSummary, validateStandards } from "./standards";

describe("성취기준", () => {
  it("교육과정 [12정03] 10개, 주요 5개", () => {
    expect(STANDARDS).toHaveLength(10);
    expect(STANDARDS.filter((s) => s.main).map((s) => s.code)).toEqual(["12정03-01", "12정03-04", "12정03-05", "12정03-06", "12정03-07"]);
    expect(standardLabel("12정03-07")).toBe("[12정03-07] 제어 구조 복합 활용");
  });

  it("CSV 칸 읽기: 전체 코드, 대괄호, 끝 번호만 써도 된다", () => {
    expect(parseStandards("[12정03-05], 12정03-04 07")).toEqual({ codes: ["12정03-04", "12정03-05", "12정03-07"], bad: [] });
    expect(parseStandards("12정03-99 자료형")).toEqual({ codes: [], bad: ["12정03-99", "자료형"] });
    expect(parseStandards("")).toEqual({ codes: [], bad: [] });
  });

  it("검사: 5개까지, 모르는 코드 안 됨", () => {
    expect(validateStandards(["12정03-04"])).toBeNull();
    expect(validateStandards(["12정03-99"])).not.toBeNull();
    expect(validateStandards(STANDARDS.slice(0, 6).map((s) => s.code))).not.toBeNull();
  });

  it("차시 기본값: 성취기준, 3문제면 1번만 기본, 4문제면 1·2번 기본, 마지막이 앵커", () => {
    expect(lessonDefaults(5, 1, [2, 3])).toEqual({ standards: ["12정03-07"], level: "기본", anchor: false });
    expect(lessonDefaults(5, 2, [1, 3])).toMatchObject({ level: "심화", anchor: false });
    expect(lessonDefaults(5, 3, [1, 2])).toMatchObject({ level: "심화", anchor: true });
    expect(lessonDefaults(2, 2, [1, 3, 4])).toMatchObject({ standards: ["12정03-04"], level: "기본", anchor: false });
    expect(lessonDefaults(2, 4, [1, 2, 3])).toMatchObject({ level: "심화", anchor: true });
    expect(lessonDefaults(1, 1, [])).toEqual({ standards: [], level: "기본", anchor: true });
  });
});

describe("성취기준별 보기", () => {
  it("문제 수·앵커·낸 학생 수·제출 수, 성취기준 없는 문제는 따로", () => {
    const problems = [
      { number: "2-1", standards: ["12정03-04"] },
      { number: "2-2", standards: ["12정03-04", "12정03-05"], anchor: true },
      { number: "3-1", standards: ["12정03-05"] },
      { number: "9-1" },
    ];
    const subs = [
      { problem: "2-1", student: "a" },
      { problem: "2-1", student: "a" },
      { problem: "2-2", student: "b" },
      { problem: "3-1", student: "a" },
      { problem: "9-1", student: "c" },
    ];
    expect(standardSummary(problems, subs)).toEqual([
      { code: "12정03-04", problems: ["2-1", "2-2"], anchors: ["2-2"], students: 2, submissions: 3 },
      { code: "12정03-05", problems: ["2-2", "3-1"], anchors: ["2-2"], students: 2, submissions: 2 },
      { code: "", problems: ["9-1"], anchors: [], students: 1, submissions: 1 },
    ]);
  });
});
