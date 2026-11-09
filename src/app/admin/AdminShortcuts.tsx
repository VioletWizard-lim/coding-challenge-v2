"use client";

import { useStudentNav } from "@/components/SideTabs";

/** 관리자 처음 화면의 바로 가기 (왼쪽 메뉴와 같은 순서). 기다리는 삭제 요청이 있으면 수를 함께 */
export default function AdminShortcuts({ pendingDeletes }: { pendingDeletes: number }) {
  const { showTab } = useStudentNav();
  const items: [string, string][] = [
    ["👩‍🏫 교사 계정", "teachers"],
    [`🧑‍🎓 학생 삭제 요청${pendingDeletes ? ` ${pendingDeletes}` : ""}`, "deletes"],
    ["🧪 체험 페이지", "trial"],
    ["🗓 학년도 말 정리", "year-end"],
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([label, tab]) => (
        <button
          key={tab}
          type="button"
          onClick={() => showTab(tab)}
          className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm font-bold hover:border-brand hover:text-brand ${
            tab === "deletes" && pendingDeletes ? "border-rose-300 bg-rose-50 text-rose-800" : "border-line bg-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
