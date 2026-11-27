/**
 * 쪽 번호 단추에 보여 줄 번호들 (Pager.tsx). 쪽이 max개 이하면 모두,
 * 더 많으면 첫 쪽·끝 쪽과 지금 쪽 근처를 보여 주되 번호가 늘 max개가 되게 채우고, 건너뛴 곳은 "gap"(…)으로.
 * 예: 20쪽 중 10쪽 → 1 … 7 8 9 10 11 12 13 … 20. 단위 테스트: pager.test.ts
 */
export function pageItems(page: number, pages: number, max = 9): (number | "gap")[] {
  if (pages <= max) return Array.from({ length: pages }, (_, i) => i + 1);
  const middle = max - 2; // 첫 쪽·끝 쪽을 뺀 가운데 번호 수
  let start = Math.max(2, page - Math.floor(middle / 2));
  const end = Math.min(pages - 1, start + middle - 1);
  start = Math.max(2, end - middle + 1);
  const items: (number | "gap")[] = [1];
  if (start > 2) items.push("gap");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < pages - 1) items.push("gap");
  items.push(pages);
  return items;
}
