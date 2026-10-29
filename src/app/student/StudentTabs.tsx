"use client";

import { useState, type ReactNode } from "react";

type Tab = { id: string; label: string; content: ReactNode };

/**
 * 학생 화면 탭. 고르지 않은 탭도 화면에서 숨기기만 하고 그대로 두어서,
 * 탭을 오가도 작성 중인 편집기·실행 결과·펼친 제출이 사라지지 않는다.
 */
export default function StudentTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0].id);
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" className="flex gap-1 rounded-xl bg-[#e8eaf0] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
            className={`flex-1 rounded-lg px-4 py-2.5 font-bold transition ${
              active === t.id ? "bg-brand text-white shadow-sm" : "text-muted hover:bg-white/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
