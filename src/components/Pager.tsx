"use client";

import { useState } from "react";

/** 쪽 나누기 버튼: « 처음 · ‹ 이전 · 1 2 3 … · 다음 › · 끝 » (쪽이 많으면 첫·끝·지금 근처 번호만) */
export default function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const [typed, setTyped] = useState("");
  if (pages <= 1) return null;
  /** 쪽 번호를 적고 이동 (범위를 넘으면 처음·끝 쪽으로) */
  const jump = () => {
    const n = Number(typed);
    if (!typed.trim() || !Number.isFinite(n)) return;
    onPage(Math.min(pages, Math.max(1, Math.round(n))));
    setTyped("");
  };
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  shown.forEach((p, i) => {
    if (i > 0 && p - shown[i - 1] > 1) items.push("gap");
    items.push(p);
  });
  const button = "min-w-9 rounded-lg border px-2.5 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav aria-label="쪽 고르기" className="flex flex-wrap items-center justify-center gap-1">
      <button type="button" onClick={() => onPage(1)} disabled={page <= 1} className={`${button} border-line bg-white`}>
        « 처음
      </button>
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
      <button type="button" onClick={() => onPage(pages)} disabled={page >= pages} className={`${button} border-line bg-white`}>
        끝 »
      </button>
      <span className="ml-2 flex items-center gap-1">
        <input
          type="number"
          min={1}
          max={pages}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") jump();
          }}
          placeholder={`${page}`}
          aria-label={`이동할 쪽 (1~${pages})`}
          className="w-16 rounded-lg border border-line bg-white px-2 py-1 text-center text-sm outline-none focus:border-brand"
        />
        <span className="text-sm text-muted">/ {pages}쪽</span>
        <button type="button" onClick={jump} className={`${button} border-line bg-white hover:bg-page`}>
          이동
        </button>
      </span>
    </nav>
  );
}
