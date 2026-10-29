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
 * 학생 화면: 왼쪽 메뉴 + 오른쪽 넓은 영역. 고르지 않은 메뉴도 화면에서 숨기기만 하고 그대로 두어서,
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
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col md:flex-row">
        {/* 넓은 화면: 왼쪽 세로 메뉴 / 좁은 화면(휴대폰): 위쪽 가로 메뉴 */}
        <nav
          role="tablist"
          aria-orientation="vertical"
          className="flex gap-1 overflow-x-auto border-b border-line bg-white p-2 md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-56 md:shrink-0 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:p-3"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setActive(t.id)}
              className={`shrink-0 rounded-lg px-4 py-2.5 text-left whitespace-nowrap transition md:w-full ${
                active === t.id ? "bg-brand-soft font-bold text-brand" : "text-muted hover:bg-page hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 p-4 md:p-6">
          {tabs.map((t) => (
            <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id}>
              {t.content}
            </div>
          ))}
        </div>
      </div>
    </NavContext>
  );
}
