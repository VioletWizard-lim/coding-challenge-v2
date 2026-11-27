import { describe, expect, it } from "vitest";
import { pageBlock } from "./pager";

describe("쪽 번호 단추 (10쪽씩 묶음)", () => {
  it("10쪽 이하면 모두, 앞뒤 묶음 없음", () => {
    expect(pageBlock(1, 5)).toEqual({ numbers: [1, 2, 3, 4, 5], prevBlock: null, nextBlock: null });
    expect(pageBlock(10, 10).numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("지금 쪽이 든 10쪽 묶음을 보여 준다", () => {
    expect(pageBlock(3, 25)).toEqual({ numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], prevBlock: null, nextBlock: 11 });
    expect(pageBlock(10, 25).numbers[9]).toBe(10);
    expect(pageBlock(11, 25)).toEqual({ numbers: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], prevBlock: 10, nextBlock: 21 });
    expect(pageBlock(23, 25)).toEqual({ numbers: [21, 22, 23, 24, 25], prevBlock: 20, nextBlock: null });
  });
  it("범위를 넘은 쪽은 처음·끝 묶음으로", () => {
    expect(pageBlock(0, 25).numbers[0]).toBe(1);
    expect(pageBlock(99, 25).numbers[0]).toBe(21);
  });
});
