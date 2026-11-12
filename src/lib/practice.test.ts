import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  asProblem,
  unsafeCodeReason,
  harnessCode,
  judge,
  normalizeSettings,
  parseRunResult,
  sameOutput,
  toDraft,
  verifyDraft,
  type PracticeDraft,
  type RunResult,
} from "./practice";

describe("출력 비교", () => {
  it("줄 끝 공백·끝의 빈 줄·줄바꿈 종류는 무시", () => {
    expect(sameOutput("a  \nb\n\n", "a\nb")).toBe(true);
    expect(sameOutput("a\r\nb", "a\nb")).toBe(true);
    expect(sameOutput("a b", "ab")).toBe(false);
    expect(sameOutput(" a", "a")).toBe(false);
  });

  it("오류가 나면 출력이 같아도 통과 아님", () => {
    const tests = [{ inputs: [], output: "1" }, { inputs: [], output: "2" }];
    const outcomes = judge(tests, [{ output: "1", error: null }, { output: "2", error: "ValueError: x" }]);
    expect(outcomes.map((o) => o.pass)).toEqual([true, false]);
  });
});

const raw = {
  title: "짝수 홀수",
  description: "정수를 입력받아 짝수인지 홀수인지 출력하세요.",
  conditions: ["if를 쓸 것", ""],
  starter_code: "n = int(input())\n",
  tests: [
    { inputs: ["4"], output: "짝수" },
    { inputs: ["7"], output: "홀수\n" },
  ],
  solution: "n = int(input())\nprint('짝수' if n % 2 == 0 else '홀수')",
};

describe("AI가 만든 문제 정리·확인", () => {
  it("모양을 정리한다", () => {
    const d = toDraft(raw) as PracticeDraft;
    expect(d.conditions).toEqual(["if를 쓸 것"]);
    expect(d.starterCode).toBe("n = int(input())");
    expect(d.tests[1].inputs).toEqual(["7"]);
  });

  it("테스트가 모자라거나 입력이 같으면 거절", () => {
    expect(toDraft({ ...raw, tests: raw.tests.slice(0, 1) })).toContain("테스트");
    expect(toDraft({ ...raw, tests: [raw.tests[0], raw.tests[0]] })).toContain("같은 입력");
    expect(toDraft({ ...raw, solution: " " })).toContain("참고 답안");
  });

  const draft = toDraft(raw) as PracticeDraft;
  const ok: RunResult[] = [
    { output: "짝수\n", error: null },
    { output: "홀수\n", error: null },
  ];
  const starter: RunResult[] = [
    { output: "", error: null },
    { output: "", error: null },
  ];

  it("참고 답안이 모두 통과하고 시작 코드로는 안 풀리면 통과", () => {
    expect(verifyDraft(draft, ok, starter)).toBeNull();
  });

  it("기대 출력이 틀리면 어디가 다른지 알려 준다", () => {
    const bad = verifyDraft(draft, [ok[0], { output: "짝수", error: null }], starter);
    expect(bad).toContain("테스트 2");
    expect(bad).toContain("홀수");
  });

  it("시작 코드만으로 풀리면 거절", () => {
    expect(verifyDraft(draft, ok, ok)).toContain("시작 코드");
  });

  it("화면용 문제: 입력 줄은 줄바꿈으로", () => {
    const p = asProblem({ ...draft, subject: "프로그래밍", level: 2 });
    expect(p.examples[0]).toEqual({ input: "4", output: "짝수" });
    expect(p.conditions).toBe("if를 쓸 것");
  });
});

describe("교사 설정", () => {
  it("개념 목록 정리, 너무 길면 거절", () => {
    expect(normalizeSettings({ enabled: false, concepts: [" 리스트 ", "리스트", ""], note: " 메모 " }, "정보")).toEqual({
      subject: "정보",
      enabled: false,
      concepts: ["리스트"],
      note: "메모",
    });
    expect(normalizeSettings({ concepts: ["x".repeat(41)] }, "정보")).toBeNull();
    expect(normalizeSettings({ concepts: "리스트" }, "정보")).toBeNull();
  });
});

// 브라우저·서버가 함께 쓰는 실행 코드를 진짜 파이썬(Pyodide)으로 확인한다
describe("테스트 실행 코드 (Pyodide)", () => {
  let run: (code: string, inputs: string[]) => RunResult;
  beforeAll(async () => {
    const dir = path.join(process.cwd(), "node_modules", "pyodide") + path.sep;
    const { loadPyodide } = await import(/* @vite-ignore */ path.join(dir, "pyodide.mjs"));
    const py = await loadPyodide({ indexURL: dir });
    run = (code, inputs) => parseRunResult(py.runPython(harnessCode(code, inputs)));
  }, 60_000);

  it("input()은 안내 글 없이 준비된 줄을 돌려준다", () => {
    expect(run('a = input("이름: ")\nb = input()\nprint(a + b)', ["철수", "님"])).toEqual({ output: "철수님\n", error: null });
  });

  it("입력이 모자라면 EOFError, 오류는 이름과 함께", () => {
    expect(run("input()\ninput()", ["1"]).error).toMatch(/^EOFError/);
    expect(run("print(x)", []).error).toMatch(/^NameError/);
  });

  it("끝나지 않는 반복과 너무 긴 출력은 멈춘다", () => {
    expect(run("while True:\n    pass", []).error).toContain("오래");
    expect(run("while True:\n    print('a')", []).error).toContain("출력이 너무");
  });

  it("따옴표·줄바꿈·역슬래시가 든 코드도 그대로, 실행마다 변수는 새로", () => {
    expect(run('s = "a\\\\b\\n\\"c\\""\nprint(s)', []).output).toBe('a\\b\n"c"\n');
    run("leftover = 1", []);
    expect(run("print(leftover)", []).error).toMatch(/^NameError/);
  });
}, 60_000);

describe("unsafeCodeReason (서버에서 돌리기 전 확인)", () => {
  it("기본 문법만 쓴 답안은 통과", () => {
    expect(unsafeCodeReason('n = int(input())\nfor i in range(n):\n    print(i * 2, "개")\nimportant = 1')).toBeNull();
    expect(unsafeCodeReason("text = input()\nprint(text.upper())")).toBeNull();
  });
  it("import, 밑줄 두 개, 위험한 함수는 막는다", () => {
    for (const code of ["import os", "x = 1\nfrom js import fetch", "print(().__class__)", "open('a.txt')", "eval('1+1')", "getattr(x, 'y')", "  import math"]) {
      expect(unsafeCodeReason(code)).not.toBeNull();
    }
  });
});
