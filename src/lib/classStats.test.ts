import { describe, expect, it } from "vitest";
import { anonIds, csvSafe, rawLogCsvRows, scoreTable, summaryCsvRows, toCsv, writingTable, type StatRow } from "./classStats";

let seq = 0;
const row = (over: Partial<StatRow>): StatRow => ({
  id: ++seq,
  key: "s1",
  studentId: "s1",
  name: "가",
  cls: "2-3",
  problem: "1-1",
  submittedAt: `2026-10-${String(seq).padStart(2, "0")}T01:00:00Z`,
  score: null,
  wrong: false,
  writing: null,
  ...over,
});
const w = (typed: number, pasted: number, activeMs = 60_000) => ({ totalMs: activeMs, activeMs, typed, pasted, pasteCount: pasted ? 1 : 0, editCount: 0, awayCount: 0, awayMs: 0 });

describe("점수 표", () => {
  it("문제마다 채점된 최근 제출, 오답은 0, 빈 칸·0점 수, 학생 정렬", () => {
    const rows = [
      row({ key: "s2", studentId: "s2", name: "나", problem: "1-1", score: 60 }),
      row({ problem: "1-1", score: 50 }),
      row({ problem: "1-1", score: 90 }), // 최근 것
      row({ problem: "1-1", score: null }), // 채점 전 재제출은 무시
      row({ problem: "1-2", wrong: true }),
      row({ key: "s2", studentId: "s2", name: "나", problem: "2-1", score: 0 }),
    ];
    const t = scoreTable(rows, ["1-1", "1-2", "1-3", "2-1"]);
    expect(t.problems).toEqual(["1-1", "1-2", "2-1"]);
    expect(t.rows.map((r) => [r.studentId, r.scores, r.total, r.zeros])).toEqual([
      ["s1", { "1-1": 90, "1-2": 0, "2-1": null }, 90, 2],
      ["s2", { "1-1": 60, "1-2": null, "2-1": 0 }, 60, 2],
    ]);
  });
});

describe("작성 통계", () => {
  const rows = [
    row({ problem: "1-1", writing: w(80, 20, 120_000) }),
    row({ problem: "1-1", writing: w(100, 0, 60_000) }), // 최근 것만
    row({ problem: "2-1", writing: w(50, 50, 30_000) }),
    row({ problem: "2-2", writing: null }),
  ];
  it("붙여넣기 비율: 단원·전체 합산", () => {
    const t = writingTable(rows, "paste");
    expect(t.units).toEqual(["전체", "1", "2"]);
    expect(t.rows[0].values).toEqual({ 전체: 25, "1": 0, "2": 50 });
    expect(t.count).toBe(2);
  });
  it("실제 작업 시간(분)", () => {
    expect(writingTable(rows, "active").rows[0].values).toEqual({ 전체: 1.5, "1": 1, "2": 0.5 });
  });
});

describe("CSV", () => {
  it("수식 막기와 따옴표, BOM", () => {
    expect(csvSafe("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvSafe(-3)).toBe("-3");
    expect(toCsv([{ a: 'x,"y"', b: "=1" }])).toBe('﻿a,b\r\n"x,""y""",\'=1\r\n');
  });
  it("익명 ID는 학생 순서대로, 익명이면 이름·아이디·반이 없다", () => {
    const rows = [row({ key: "s9", studentId: "s9", name: "다" }), row({ writing: w(10, 10), score: 80 })];
    expect([...anonIds(rows).entries()]).toEqual([["s1", "S001"], ["s9", "S002"]]);
    const csv = summaryCsvRows(rows, "프로그래밍", 2026, true);
    expect(Object.keys(csv[0])).not.toContain("이름");
    expect(csv[0]).toMatchObject({ 익명ID: "S001", "붙여넣기비율(%)": 50, 점수: 80, 최신제출: "Y" });
  });
  it("원본 로그: 종류 이름", () => {
    const r = row({});
    const out = rawLogCsvRows([r], new Map([[r.id, [[1000, "i", 0, 0, 0, 0, "a"], [2500, "r:NameError"], [3000, "q"]]]]), false);
    expect(out.map((x) => [x.종류명, x["경과(초)"]])).toEqual([["입력", 0], ["실행오류(NameError)", 1.5], ["AI도움요청", 2]]);
  });
});
