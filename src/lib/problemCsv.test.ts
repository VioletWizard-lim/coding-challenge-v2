import { describe, expect, it } from "vitest";
import type { Problem } from "./problemBank";
import {
  changedFields,
  parseDifficulty,
  parseOpen,
  parseProblemCsv,
  problemsToCsv,
  resolveOpenAt,
  toKstText,
} from "./problemCsv";

const now = new Date("2026-10-29T03:00:00Z"); // 한국 12시

const card: Problem = {
  id: 6,
  subject: "프로그래밍",
  number: "1-6",
  title: "급식 추천 카드 완성",
  difficulty: 3,
  description: '"급식 추천 카드"를 만들어야 합니다.',
  conditions: "1. input()을 4번 이상 사용할 것 (이름, 반찬, 밥 종류, 국 종류)\n2. 예시와 같은 형태로 출력할 것",
  examples: [
    { input: "길동 / 돈까스 / 볶음밥 / 된장국", output: "=== 급식 추천 카드 ===\n이름: 길동" },
    { input: "영희 / 제육볶음 / 흑미밥 / 미역국", output: "=== 급식 추천 카드 ===\n이름: 영희" },
  ],
  goal: "여러 input 값을 종합적으로 관리·조합·출력",
  challenge: "구분선(====)을 넣어 보기",
  starterCode: "name = input()\n",
  openAt: "2026-10-01T00:00:00Z",
};

describe("공개·난이도 칸", () => {
  it("공개 칸을 읽는다 (시각은 한국 시간)", () => {
    expect(parseOpen("")).toEqual({ kind: "hidden" });
    expect(parseOpen("비공개")).toEqual({ kind: "hidden" });
    expect(parseOpen(" 공개 ")).toEqual({ kind: "open" });
    expect(parseOpen("2026-11-03 09:00")).toEqual({ kind: "at", iso: "2026-11-03T00:00:00.000Z" });
    expect(parseOpen("2026.11.3 9:05")).toEqual({ kind: "at", iso: "2026-11-03T00:05:00.000Z" });
    expect(parseOpen("내일")).toBeNull();
    expect(parseOpen("2026-13-01 09:00")).toBeNull();
    expect(toKstText("2026-11-03T00:05:00.000Z")).toBe("2026-11-03 09:05");
  });
  it("난이도는 숫자나 ★", () => {
    expect(parseDifficulty("3")).toBe(3);
    expect(parseDifficulty("★★★★")).toBe(4);
    expect(parseDifficulty("")).toBeNull();
    expect(parseDifficulty("세 개")).toBeNaN();
  });
});

describe("내려받기 → 다시 올리기", () => {
  it("내려받은 파일을 그대로 올리면 같은 문제가 되고, 바뀌는 칸이 없다", () => {
    const scheduled: Problem = { ...card, id: 7, number: "1-7", examples: [], openAt: "2026-11-03T00:00:00Z" };
    const hidden: Problem = { ...card, id: 8, number: "1-8", title: "1-8", difficulty: null, openAt: null };
    const csv = problemsToCsv([hidden, card, scheduled], now);
    const { rows, error } = parseProblemCsv(csv);
    expect(error).toBeNull();
    expect(rows.map((r) => r.error)).toEqual([null, null, null]);
    expect(rows.map((r) => r.input.number)).toEqual(["1-6", "1-7", "1-8"]); // 번호 순
    const [r6, r7, r8] = rows;
    expect(r6.open).toEqual({ kind: "open" });
    expect(r7.open).toEqual({ kind: "at", iso: "2026-11-03T00:00:00.000Z" });
    expect(r8.open).toEqual({ kind: "hidden" });
    const next6 = { ...r6.input, openAt: resolveOpenAt(r6.open, card, now) };
    expect(changedFields(card, next6)).toEqual([]);
    const next8 = { ...r8.input, openAt: resolveOpenAt(r8.open, hidden, now) };
    expect(changedFields(hidden, next8)).toEqual([]);
  });

  it("엑셀이 바꾼 \\r\\n 줄바꿈과 ★ 난이도도 읽는다", () => {
    const csv = '과목,번호,제목,난이도,예시1 입력,예시1 출력,공개\r\n프로그래밍,2-1,가격표,★★,,"1000\r\n2000",공개\r\n';
    const [r] = parseProblemCsv(csv).rows;
    expect(r.error).toBeNull();
    expect(r.input.difficulty).toBe(2);
    expect(r.input.examples).toEqual([{ input: "", output: "1000\n2000" }]);
  });
});

describe("검사", () => {
  const head = "과목,번호,제목,난이도,공개\n";
  it.each([
    ["국어,1-1,가,,", "과목"],
    ["프로그래밍,1.1,가,,", "단원-번호"],
    ["프로그래밍,1-1,가,6,", "난이도"],
    ["프로그래밍,1-1,가,세개,", "난이도"],
    ["프로그래밍,1-1,가,,다음 주", "공개 칸"],
  ])("%s → 오류", (line, msg) => {
    expect(parseProblemCsv(head + line).rows[0].error).toContain(msg);
  });
  it("제목을 비우면 번호를 제목으로, 같은 번호가 또 있으면 오류", () => {
    const { rows } = parseProblemCsv(head + "정보,1-1,,,\n정보,1-1,다시,,\n");
    expect(rows[0].input.title).toBe("1-1");
    expect(rows[1].error).toContain("같은 과목·번호");
  });
  it("필수 제목 줄이 없으면 파일 전체 거부", () => {
    expect(parseProblemCsv("번호,제목\n1-1,가").error).toContain("과목");
  });
});

describe("공개 시각 정하기", () => {
  it("이미 공개된 문제를 '공개'로 두면 처음 공개 시각을 지킨다", () => {
    expect(resolveOpenAt({ kind: "open" }, card, now)).toBe(card.openAt);
    expect(resolveOpenAt({ kind: "open" }, { ...card, openAt: null }, now)).toBe(now.toISOString());
    expect(resolveOpenAt({ kind: "open" }, undefined, now)).toBe(now.toISOString());
    expect(resolveOpenAt({ kind: "hidden" }, card, now)).toBeNull();
    const scheduled = { ...card, openAt: "2026-11-03T00:00:42.123Z" };
    expect(resolveOpenAt({ kind: "at", iso: "2026-11-03T00:00:00.000Z" }, scheduled, now)).toBe(scheduled.openAt);
    expect(resolveOpenAt({ kind: "at", iso: "2026-11-03T00:01:00.000Z" }, scheduled, now)).toBe("2026-11-03T00:01:00.000Z");
  });
  it("바뀌는 칸 이름", () => {
    expect(changedFields(card, { ...card, goal: "다른 목표", openAt: null })).toEqual(["문제 목표", "공개"]);
  });
});
