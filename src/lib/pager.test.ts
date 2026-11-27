import { describe, expect, it } from "vitest";
import { pageItems } from "./pager";

describe("쪽 번호 단추", () => {
  it("쪽이 9개 이하면 모두 보여 준다", () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(9, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("많으면 첫·끝 쪽과 지금 쪽 근처를 번호 9개로", () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, "gap", 20]);
    expect(pageItems(10, 20)).toEqual([1, "gap", 7, 8, 9, 10, 11, 12, 13, "gap", 20]);
    expect(pageItems(20, 20)).toEqual([1, "gap", 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(pageItems(5, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, "gap", 10]);
  });
  it("번호는 늘 9개", () => {
    for (let pages = 10; pages <= 30; pages++)
      for (let page = 1; page <= pages; page++) expect(pageItems(page, pages).filter((x) => x !== "gap")).toHaveLength(9);
  });
});
