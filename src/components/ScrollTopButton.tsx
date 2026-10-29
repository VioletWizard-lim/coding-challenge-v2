"use client";

import { useEffect, useState } from "react";

/** 화면을 많이 내렸을 때만 오른쪽 아래에 나타나는 "맨 위로" 버튼 */
export default function ScrollTopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed right-5 bottom-5 z-30 rounded-full border border-line bg-white px-4 py-2.5 text-sm font-bold text-brand shadow-lg hover:bg-brand-soft"
    >
      ↑ 맨 위로
    </button>
  );
}
