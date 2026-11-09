import { describe, expect, it } from "vitest";
import { defaultAiSettings, helperBlocked, normalizeAiSettings, reviewBlocked } from "./aiSettings";

describe("AI 기능 설정", () => {
  it("저장된 것이 없으면 모두 켜짐", () => {
    const s = defaultAiSettings("프로그래밍");
    expect(helperBlocked(s, "3-2")).toBeNull();
    expect(reviewBlocked(s)).toBeNull();
  });

  it("단원 끄기는 수업 문제에만 (연습 P12·학생 문제 S7은 과목 설정만 따름)", () => {
    const s = { ...defaultAiSettings("프로그래밍"), offUnits: ["3"] };
    expect(helperBlocked(s, "3-2")).toContain("3단원");
    expect(helperBlocked(s, "13-1")).toBeNull();
    expect(helperBlocked(s, "P3")).toBeNull();
    expect(helperBlocked(s, "S3")).toBeNull();
    expect(helperBlocked({ ...s, helper: false }, "P3")).toContain("꺼 두었어요");
  });

  it("설정 정리: 단원은 숫자만, 정렬, 중복 없음 / 지침이 너무 길면 거절", () => {
    expect(normalizeAiSettings({ helper: false, offUnits: ["10", "3", "3", "x", " 2 "], note: " 메모 " }, "정보")).toEqual({
      subject: "정보",
      helper: false,
      review: true,
      offUnits: ["2", "3", "10"],
      note: "메모",
    });
    expect(normalizeAiSettings({ note: "x".repeat(501) }, "정보")).toBeNull();
  });
});
