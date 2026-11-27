import { describe, expect, it } from "vitest";
import type { AskClip } from "./askBack";
import {
  allProblemMetrics,
  askCsvRows,
  askJudgeRows,
  autoJudge,
  groupsOf,
  groupSummaries,
  metricsCsvRows,
  problemMetrics,
  withNotes,
  type ResearchChat,
  type ResearchProblem,
  type ResearchSubmission,
} from "./researchStats";

const T = 1_000_000;
const sub = (log: unknown[], extra: Partial<ResearchSubmission> = {}): ResearchSubmission => ({
  id: 1,
  student: "s1",
  problem: "2-3",
  submittedAt: "2027-03-20T01:00:00Z",
  score: 90,
  log,
  ...extra,
});
const clip = (over: Partial<AskClip> = {}): AskClip => ({
  rule: "error-repeat",
  from: 0,
  to: 1,
  line: 3,
  count: 3,
  error: "NameError",
  minutes: 2,
  lineVersions: ["print(totl)"],
  codeAt: "",
  ...over,
});
const chat = (over: Partial<ResearchChat>): ResearchChat => ({
  id: 1,
  student: "s1",
  problem: "2-3",
  at: T,
  question: "",
  step: "ask",
  situation: "A",
  clip: clip(),
  parentId: null,
  createdAt: "2027-03-20T00:00:00Z",
  ...over,
});

describe("학생 × 문제 지표", () => {
  const log = [
    [T, "open"],
    [T + 30_000, "i", 0, 0, 0, 0, "  "], // 공백은 의미 있는 입력이 아님
    [T + 45_000, "i", 0, 2, 0, 2, "print(a)"],
    [T + 50_000, "r:NameError"],
    [T + 60_000, "p", 0, 0, 0, 0, "a = 1\n"],
    [T + 70_000, "t:1/2"],
    [T + 80_000, "r:ok"],
    [T + 90_000, "t:2/2"],
    [T + 95_000, "r:ok"],
    [T + 99_000, "t:2/2"],
  ];
  it("시도 횟수·오류 후 통과·붙여넣기·첫 입력", () => {
    const m = problemMetrics("s1", "2-3", [sub(log)], []);
    expect(m).toMatchObject({
      checked: true,
      passed: true,
      lastCheck: "2/2",
      attempts: 4, // r:NameError, t:1/2, r:ok, t:2/2
      hadError: true,
      passedAfterError: true,
      typedChars: 10,
      pastedChars: 6,
      pasteCount: 1,
      firstInputSec: 45,
    });
  });
  it("마지막 확인이 틀리면 통과 아님, 확인 기록이 없으면 빈칸", () => {
    expect(problemMetrics("s1", "2-3", [sub([...log, [T + 120_000, "t:1/2"]])], []).passed).toBe(false);
    const none = problemMetrics("s1", "2-3", [sub([[T, "i", 0, 0, 0, 0, "x"], [T + 1, "r:ok"]])], []);
    expect(none).toMatchObject({ checked: false, passed: null, passedAfterError: null, firstInputSec: null });
  });
  it("가장 최근 제출의 기록을 쓴다", () => {
    const old = sub([[T, "t:0/2"]], { id: 1, submittedAt: "2027-03-20T00:00:00Z" });
    const now = sub(log, { id: 2, submittedAt: "2027-03-21T00:00:00Z", score: 100 });
    expect(problemMetrics("s1", "2-3", [now, old], [])).toMatchObject({ submissions: 2, score: 100, passed: true });
  });
  it("AI: 요청·힌트·힌트 없이 해결·빈 화면", () => {
    const chats = [
      chat({ id: 1, at: T + 40_000 }), // 답 안 하고 뒤에 통과 → 힌트 없이 해결
      chat({ id: 2, at: T + 55_000 }),
      chat({ id: 3, step: "hint", parentId: 2, question: "3번째 줄 totl" }),
      chat({ id: 4, at: T + 200_000, situation: "B", clip: clip({ rule: "understand", line: null }) }), // 통과 뒤 → 해결 아님
      chat({ id: 5, step: null }), // 예전 방식 질문
    ];
    expect(problemMetrics("s1", "2-3", [sub(log)], chats)).toMatchObject({ aiRequests: 4, aiHints: 1, asks: 3, solvedWithoutHint: 1, emptyAsks: 1 });
  });
});

describe("묶음 요약", () => {
  const problems = new Map<string, ResearchProblem>([
    ["2-1", { number: "2-1", title: "", lesson: 2, lessonOrder: 1, level: "기본", anchor: false, standards: ["12정03-04"] }],
    ["2-3", { number: "2-3", title: "", lesson: 2, lessonOrder: 3, level: "심화", anchor: true, standards: ["12정03-04"] }],
    ["6-3", { number: "6-3", title: "", lesson: 6, lessonOrder: 3, level: "심화", anchor: true, standards: ["12정03-07"] }],
  ]);
  it("묶음 이름", () => {
    expect(groupsOf(problems.get("2-3"))).toEqual(["전체", "전반부(1~4차시)", "앵커 전체", "앵커 전반부(1~4차시)", "심화", "심화 전반부(1~4차시)", "2차시"]);
    expect(groupsOf(undefined)).toEqual(["전체"]);
  });
  it("앵커 전반·후반 통과율과 평균 시도", () => {
    const subs = [
      sub([[T, "r:ok"], [T + 1, "t:1/1"]], { problem: "2-3" }),
      sub([[T, "r:Error"], [T + 1, "t:0/1"], [T + 2, "t:1/1"]], { problem: "6-3", id: 2 }),
      sub([[T, "t:0/1"]], { problem: "2-1", id: 3 }),
    ];
    const rows = groupSummaries(allProblemMetrics(subs, []), problems);
    const g = (name: string) => rows.find((r) => r.group === name)!;
    expect(g("전체")).toMatchObject({ problems: 3, passRate: 66.7, avgAttempts: 2.5, passAfterErrorRate: 100 });
    expect(g("앵커 전반부(1~4차시)")).toMatchObject({ problems: 1, avgAttempts: 2 });
    expect(g("앵커 후반부(5~8차시)")).toMatchObject({ problems: 1, avgAttempts: 3 });
    expect(rows.map((r) => r.group).slice(0, 3)).toEqual(["전체", "전반부(1~4차시)", "후반부(5~8차시)"]);
    const csv = metricsCsvRows(allProblemMetrics(subs, []), problems, () => "R1");
    expect(csv.map((r) => r.문제)).toEqual(["2-1", "2-3", "6-3"]); // 차시·순서대로
    expect(csv[1]).toMatchObject({ 앵커: "O", 성취기준: "12정03-04", "통과(예시)": "O", "1_시도횟수": 2 });
  });
});

describe("지표 6: 막힌 지점 짚기", () => {
  it("자동 판정 (참고용)", () => {
    expect(autoJudge(clip(), "3번째 줄이 이상해요").auto).toBe("예");
    expect(autoJudge(clip(), "line 3")).toMatchObject({ auto: "예" });
    expect(autoJudge(clip(), "13줄")).toMatchObject({ auto: "아니오" });
    expect(autoJudge(clip(), "nameerror 나요")).toMatchObject({ auto: "예", reason: "오류 이름을 말함" });
    expect(autoJudge(clip(), "totl 변수 철자")).toMatchObject({ auto: "예" });
    expect(autoJudge(clip(), "print가 안 돼요")).toMatchObject({ auto: "아니오" }); // 흔한 낱말은 빼고 봄
    expect(autoJudge(clip(), "모르겠어요")).toMatchObject({ auto: "아니오" });
    expect(autoJudge(clip({ rule: "understand", line: null }), "입력을 모르겠어요").auto).toBe("");
  });
  it("되물음마다 한 줄, 교사 판정 칸은 빈칸", () => {
    const rows = askJudgeRows([chat({ id: 7 }), chat({ id: 8, step: "hint", parentId: 7, question: "3줄" }), chat({ id: 9 })]);
    expect(rows.map((r) => [r.askId, r.answer, r.auto])).toEqual([
      [7, "3줄", "예"],
      [9, "", ""],
    ]);
    const csv = askCsvRows(rows, new Map(), () => "R1");
    expect(csv[0]).toMatchObject({ 익명ID: "R1", "보여 준 구간": "같은 오류 반복 · 3번째 줄 · 오류 NameError 3번", "교사 판정(예/아니오)": "" });
    expect(JSON.stringify(csv)).not.toContain("s1"); // 아이디가 새지 않음
  });
  it("설명 줄은 따옴표로 한 칸에", () => {
    const out = withNotes("﻿a,b\r\n1,2\r\n", ["가, 나"]);
    expect(out).toBe('﻿"# 가, 나"\r\na,b\r\n1,2\r\n');
  });
});

describe("학번 → 익명 ID 대응표", async () => {
  const { idMapRows } = await import("./researchStats");
  it("그 과목·반 학생만, 반·학번 순", () => {
    const st = (id: string, cls: number, subjects = "정보") => ({ id, name: id, grade: 1, class: cls, programming_grade: null, programming_class: null, subjects });
    const rows = idMapRows([st("s3", 2), st("s1", 1), st("loadtest1", 1), st("s2", 1, "프로그래밍")], {
      cls: "",
      anon: (k) => `R-${k}`,
      takes: (s) => (s.subjects ?? "").includes("정보"),
      classFor: (s) => `${s.grade}-${s.class}`,
      skip: (id) => id.startsWith("loadtest"),
    });
    expect(rows).toEqual([
      { 반: "1-1", "학번(아이디)": "s1", 이름: "s1", 익명ID: "R-s1" },
      { 반: "1-2", "학번(아이디)": "s3", 이름: "s3", 익명ID: "R-s3" },
    ]);
  });
});
