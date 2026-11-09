import { describe, expect, it } from "vitest";
import { classKeyOf, inputLines, statusFor, studentAsProblem, validateStudentProblem, type StudentProblemInput } from "./studentProblem";

const good: StudentProblemInput = {
  subject: "프로그래밍",
  title: " 간식 나누기 ",
  description: "간식 수와 사람 수를 입력받아 한 사람이 받는 수를 출력하세요.",
  conditions: ["// 나누기 몫", ""],
  starterCode: "a = input()\n\n",
  tests: [
    { inputs: ["10", "3"], output: "3" },
    { inputs: ["9", "3"], output: "3\n" },
  ],
  solution: "print(int(input()) // int(input()))",
  share: "class",
};

describe("학생이 만든 문제 확인", () => {
  it("정리해서 받는다", () => {
    const p = validateStudentProblem(good, ["프로그래밍"]) as StudentProblemInput;
    expect(p.title).toBe("간식 나누기");
    expect(p.conditions).toEqual(["// 나누기 몫"]);
    expect(p.starterCode).toBe("a = input()");
    expect(p.share).toBe("class");
  });

  it("과목·예시 수·빈 출력·같은 입력·빈 답은 거절", () => {
    expect(validateStudentProblem(good, ["정보"])).toContain("과목");
    expect(validateStudentProblem({ ...good, tests: good.tests.slice(0, 1) }, ["프로그래밍"])).toContain("예시는");
    expect(validateStudentProblem({ ...good, tests: [good.tests[0], { inputs: ["1"], output: " " }] }, ["프로그래밍"])).toContain("기대 출력");
    expect(validateStudentProblem({ ...good, tests: [good.tests[0], good.tests[0]] }, ["프로그래밍"])).toContain("똑같은");
    expect(validateStudentProblem({ ...good, solution: "" }, ["프로그래밍"])).toContain("내 답");
  });

  it("공개 범위가 이상하면 나만 풀기", () => {
    const p = validateStudentProblem({ ...good, share: "everyone" as never }, ["프로그래밍"]) as StudentProblemInput;
    expect(p.share).toBe("private");
    expect(statusFor("class")).toBe("pending");
    expect(statusFor("private")).toBe("private");
  });

  it("입력 칸: 한 줄에 하나, 끝의 빈 줄은 버리고 가운데 빈 줄(빈 입력)은 남긴다", () => {
    expect(inputLines("10\r\n\n3\n\n")).toEqual(["10", "", "3"]);
    expect(inputLines("")).toEqual([]);
  });

  it("반 키와 화면용 문제", () => {
    expect(classKeyOf({ grade: 2, class: 3 })).toBe("2-3");
    expect(classKeyOf({ grade: null, class: 3 })).toBe("");
    expect(studentAsProblem(good).examples[0]).toEqual({ input: "10\n3", output: "3" });
  });
});
