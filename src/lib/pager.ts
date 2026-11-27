/**
 * 쪽 번호 단추에 보여 줄 번호들 (Pager.tsx). 게시판처럼 10쪽씩 묶어서 지금 쪽이 든 묶음을 모두 보여 준다.
 * 예: 25쪽 중 13쪽 → 11 12 … 20. 앞·뒤에 묶음이 더 있으면 prevBlock·nextBlock에 그 묶음으로 넘어갈 쪽을 준다(없으면 null).
 * 단위 테스트: pager.test.ts
 */
export const PAGE_BLOCK = 10;

export function pageBlock(page: number, pages: number, size = PAGE_BLOCK): { numbers: number[]; prevBlock: number | null; nextBlock: number | null } {
  const current = Math.min(Math.max(1, page), Math.max(1, pages));
  const start = Math.floor((current - 1) / size) * size + 1;
  const end = Math.min(pages, start + size - 1);
  return {
    numbers: Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i),
    prevBlock: start > 1 ? start - 1 : null, // 앞 묶음의 마지막 쪽
    nextBlock: end < pages ? end + 1 : null, // 뒤 묶음의 첫 쪽
  };
}
