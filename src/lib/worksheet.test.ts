import { describe, expect, it } from "vitest";
import { toProblems, validNumberCount } from "./worksheet";

describe("AI가 읽은 학습지 → 문제", () => {
  it("학습지 1-6 형식을 문제로 바꾼다", () => {
    const [p] = toProblems(
      {
        problems: [
          {
            number: "1-6",
            title: "급식 추천 카드 완성",
            difficulty: 3,
            description: "  영양사 선생님이 …  ",
            conditions: ["1. input()을 4번 이상 사용할 것", "추천 조합 메뉴는 결합해서 만들 것", ""],
            examples: [
              { input: "길동 / 돈까스 / 볶음밥 / 된장국", output: "=== 급식 추천 카드 ===\n이름: 길동" },
              { input: "", output: "" },
            ],
            goal: "여러 input 값을 종합적으로 관리",
            challenge: "구분선(====)을 넣어 보기",
          },
        ],
      },
      "프로그래밍",
    );
    expect(p).toEqual({
      subject: "프로그래밍",
      number: "1-6",
      title: "급식 추천 카드 완성",
      difficulty: 3,
      description: "영양사 선생님이 …",
      conditions: "input()을 4번 이상 사용할 것\n추천 조합 메뉴는 결합해서 만들 것",
      examples: [{ input: "길동 / 돈까스 / 볶음밥 / 된장국", output: "=== 급식 추천 카드 ===\n이름: 길동" }],
      goal: "여러 input 값을 종합적으로 관리",
      challenge: "구분선(====)을 넣어 보기",
      starterCode: "",
    });
  });

  it("어긋난 값은 고치거나 비운다", () => {
    const list = toProblems(
      { problems: [{ number: "2 . 3", difficulty: 0 }, { number: "가-나", title: "x", difficulty: 9, examples: "x" }, null] },
      "정보",
    );
    expect(list[0]).toMatchObject({ number: "2-3", title: "2-3", difficulty: null, examples: [], conditions: "" });
    expect(list[1].difficulty).toBeNull();
    expect(validNumberCount(list)).toBe(1);
    expect(toProblems(null, "정보")).toEqual([]);
    expect(toProblems({ problems: "x" }, "정보")).toEqual([]);
  });
});

describe("학습지 파일 형식", () => {
  it("형식이 비어 있으면 확장자로 정하고, 모르는 형식은 거부", async () => {
    const { worksheetType, DOCX_TYPE, looksLike } = await import("./worksheet");
    expect(worksheetType("학습지.docx", "")).toBe(DOCX_TYPE);
    expect(worksheetType("a.PDF", "")).toBe("application/pdf");
    expect(worksheetType("a.jpg", "image/jpeg")).toBe("image/jpeg");
    expect(worksheetType("a.hwp", "")).toBeNull();
    expect(looksLike("application/pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(looksLike("application/pdf", new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(false);
    expect(looksLike(DOCX_TYPE, new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(true);
  });
  it("docx HTML에서 그림을 뺀다", async () => {
    const { cleanDocxHtml } = await import("./worksheet");
    expect(cleanDocxHtml('<p>문제 <img src="data:x" />1</p>\n\n<table><tr><td>조건</td></tr></table>')).toBe(
      "<p>문제 1</p> <table><tr><td>조건</td></tr></table>",
    );
  });
});

describe("학습지 읽기 진행 게이지", async () => {
  const { countFoundProblems, gaugePercent } = await import("./worksheet");
  it("옮겨 적기 시작한 문제 수", () => {
    expect(countFoundProblems('{"problems":[{"number":"1-1","title":"a"},{"number" :"1-2"')).toBe(2);
    expect(countFoundProblems("")).toBe(0);
  });
  it("단계마다 앞으로만 가고, 100%는 끝날 때만", () => {
    expect(gaugePercent("sending", 0, 0)).toBe(5);
    expect(gaugePercent("reading", 0, 0)).toBe(10);
    expect(gaugePercent("reading", 600_000, 0)).toBeLessThanOrEqual(40);
    expect(gaugePercent("writing", 0, 0)).toBe(40);
    expect(gaugePercent("writing", 0, 4000)).toBeGreaterThan(gaugePercent("writing", 0, 1000));
    expect(gaugePercent("writing", 0, 1_000_000)).toBeLessThanOrEqual(95);
  });
});

describe("학습지의 수업 계획 칸", async () => {
  const { toProblems: read, fillLessonDefaults } = await import("./worksheet");
  const base = { number: "2-1", title: "가", difficulty: 1, description: "", conditions: [], examples: [], goal: "", challenge: "" };
  it("차시가 없으면 수업 계획은 정하지 않음 (이미 있는 값을 지킴)", () => {
    const [p] = read({ problems: [{ ...base, lesson: 0, lesson_order: 0, level: "", anchor: false, standards: [] }] }, "정보");
    expect(p.lesson).toBeUndefined();
    expect(p.anchor).toBeUndefined();
    expect(p.standards).toBeUndefined();
  });
  it("차시·순서·성취기준을 읽고 모르는 코드는 뺀다", () => {
    const [p] = read({ problems: [{ ...base, lesson: 2, lesson_order: 3, level: "심화", anchor: true, standards: ["12정03-05", "[12정03-04]", "12정99-1"] }] }, "정보");
    expect(p).toMatchObject({ lesson: 2, lessonOrder: 3, level: "심화", anchor: true, standards: ["12정03-04", "12정03-05"] });
  });
  it("차시·순서만 적으면 양식과 같은 규칙으로 채운다 (앵커 표시가 없으면 마지막 순서)", () => {
    const raw = [1, 2, 3].map((n) => ({ ...base, number: `5-${n}`, lesson: 5, lesson_order: n, level: "", anchor: false, standards: [] }));
    const filled = fillLessonDefaults(read({ problems: raw }, "정보"));
    expect(filled.map((p) => [p.level, p.anchor, p.standards])).toEqual([
      ["기본", false, ["12정03-07"]],
      ["심화", false, ["12정03-07"]],
      ["심화", true, ["12정03-07"]],
    ]);
    // 앵커를 직접 표시했으면 그대로
    const marked = fillLessonDefaults(read({ problems: raw.map((r, i) => ({ ...r, anchor: i === 1 })) }, "정보"));
    expect(marked.map((p) => p.anchor)).toEqual([false, true, false]);
  });
});
