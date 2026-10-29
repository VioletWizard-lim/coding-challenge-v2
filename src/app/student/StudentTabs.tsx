"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Tab = { id: string; label: string; content: ReactNode };

/** 탭끼리 주고받는 상태: 내 제출 현황에서 고른 문제와, 다른 탭에서 "이 제출 보기"로 연 제출 */
type StudentNav = {
  selectedProblem: string;
  setSelectedProblem: (key: string) => void;
  focusedSubmission: number | null;
  /** 내 제출 현황 탭으로 옮겨 그 문제를 고르고, 그 제출을 펼쳐 작성 과정을 바로 연다 */
  showSubmission: (problemKey: string, submissionId: number) => void;
};

const NavContext = createContext<StudentNav | null>(null);

export function useStudentNav() {
  const nav = useContext(NavContext);
  if (!nav) throw new Error("StudentTabs 안에서만 쓸 수 있어요");
  return nav;
}

const SUBMISSIONS_TAB = "submissions";

/**
 * 학생 화면 탭. 고르지 않은 탭도 화면에서 숨기기만 하고 그대로 두어서,
 * 탭을 오가도 작성 중인 편집기·실행 결과·펼친 제출이 사라지지 않는다.
 */
export default function StudentTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const [selectedProblem, setSelectedProblem] = useState("all");
  const [focusedSubmission, setFocusedSubmission] = useState<number | null>(null);

  const nav: StudentNav = {
    selectedProblem,
    setSelectedProblem,
    focusedSubmission,
    showSubmission(problemKey, submissionId) {
      setSelectedProblem(problemKey);
      setFocusedSubmission(submissionId);
      setActive(SUBMISSIONS_TAB);
    },
  };

  return (
    <NavContext value={nav}>
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
    </NavContext>
  );
}
