"use client";

/** 쪽 나누기 버튼: ‹ 이전 · 1 2 3 … · 다음 › (쪽이 많으면 처음·끝·지금 근처만) */
export default function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  shown.forEach((p, i) => {
    if (i > 0 && p - shown[i - 1] > 1) items.push("gap");
    items.push(p);
  });
  const button = "min-w-9 rounded-lg border px-2.5 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav aria-label="쪽 고르기" className="flex flex-wrap items-center justify-center gap-1">
      <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className={`${button} border-line bg-white`}>
        ‹ 이전
      </button>
      {items.map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-muted">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={`${button} ${p === page ? "border-brand bg-brand font-bold text-white" : "border-line bg-white hover:bg-page"}`}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} className={`${button} border-line bg-white`}>
        다음 ›
      </button>
    </nav>
  );
}
