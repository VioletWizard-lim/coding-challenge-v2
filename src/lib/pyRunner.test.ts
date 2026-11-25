import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runPythonTests } = await import("./pyRunner");

// 서버에서 AI가 만든 코드를 돌리는 곳: 진짜 작업 공간(worker + Pyodide)으로 확인한다
describe("runPythonTests (서버 실행)", () => {
  it("기본 문법으로 쓴 답안은 그대로 돌아간다 (입력·함수·클래스·예외)", async () => {
    const code = [
      "class Box:",
      "    size = 2",
      "def double(x):",
      "    return x * Box.size",
      "try:",
      "    n = int(input())",
      "    print(double(n), sorted([3, 1, 2]), isinstance(Box(), Box))",
      "except ValueError:",
      "    print('숫자가 아니에요')",
    ].join("\n");
    const [results] = await runPythonTests([code], [["4"], ["abc"]]);
    expect(results).toEqual([
      { output: "8 [1, 2, 3] True\n", error: null },
      { output: "숫자가 아니에요\n", error: null },
    ]);
  }, 60_000);

  // 예전 글자 확인만으로는 지나가던 우회 방법들
  const bypasses: [string, string][] = [
    ["함수를 변수에 담기", 'f = eval\nm = f("1+1")\nprint(m)'],
    ["전각 글자", 'print(ｅｖａｌ("1+1"))'],
    ["생성기 프레임으로 내장 함수 꺼내기", "g = (x for x in [1])\nb = g.gi_frame.f_builtins\nprint(b)"],
    ["오류 추적에서 프레임 꺼내기", "try:\n    1 / 0\nexcept Exception as e:\n    t = e.with_traceback(None)\n    print(t.tb_frame)"],
    ["match 문으로 속성 꺼내기", "g = (x for x in [1])\nmatch g:\n    case object(gi_frame=f):\n        print(f)"],
    ["이름 바꿔 open 쓰기", "o = open\nprint(o)"],
  ];
  for (const [label, code] of bypasses) {
    it(`막는다: ${label}`, async () => {
      await expect(runPythonTests([code], [[]])).rejects.toThrow(/서버에서 돌릴 수 없는 코드/);
    }, 60_000);
  }

  it("참고 답안과 시작 코드 중 하나만 위험해도 둘 다 돌리지 않는다", async () => {
    await expect(runPythonTests(["print(1)", "x = vars\nprint(x)"], [[]])).rejects.toThrow(/vars/);
  }, 60_000);
});
