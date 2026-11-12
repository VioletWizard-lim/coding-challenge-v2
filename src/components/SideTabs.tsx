"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { GO_HOME_EVENT } from "./HomeLink";
import ScrollTopButton from "./ScrollTopButton";

type Tab = { id: string; label: string; content: ReactNode };

/**
 * 탭을 떠날 때 알려 줄 것 (예: 제출하지 않은 코드). 알릴 게 없으면 null.
 * 이동을 막고 묻지 않는다(잃는 것이 없으므로): 바로 이동하고, 화면 아래에 잠깐 안내와 "돌아가기"를 보여 준다.
 * onLeave: 안내를 보여 준 뒤 부른다 (같은 내용으로 또 알리지 않게 기억하는 데 쓴다)
 */
export type LeaveGuard = () => { message: string; onLeave: () => void } | null;

/** 탭끼리 주고받는 상태: 내 기록 다시 보기에서 고른 문제와, 다른 탭에서 "이 제출 보기"로 연 제출 */
type StudentNav = {
  selectedProblem: string;
  setSelectedProblem: (key: string) => void;
  focusedSubmission: number | null;
  /** 재생을 이 순간(기록 안의 시각)부터 연다 (업적에서 왔을 때) */
  focusedAt: number | null;
  /** 내 기록 다시 보기 탭으로 옮겨 그 문제를 고르고, 그 제출을 펼쳐 작성 과정을 바로 연다 */
  showSubmission: (problemKey: string, submissionId: number, at?: number) => void;
  /** 이 탭을 떠날 때 확인할 것을 등록한다 (null이면 지움) */
  setLeaveGuard: (tabId: string, guard: LeaveGuard | null) => void;
  /** 다른 탭으로 옮긴다 (예: 새 업적 알림 → 업적 탭) */
  showTab: (id: string) => void;
  /** 코드 작성 탭에서 이 문제를 골라 연다 (첫 화면의 "코드 작성하러 가기"). n은 같은 문제를 다시 눌러도 바뀌게 */
  writeTarget: { subject: string; number: string; n: number } | null;
  startWriting: (subject: string, number: string) => void;
  /** 문제 이름 ("2-3. 용돈 확인하기"). 교사가 올린 문제 제목을 쓰고, 없으면 번호만 */
  problemLabel: (subject: string, number: string) => string;
};

const NavContext = createContext<StudentNav | null>(null);

export function useStudentNav() {
  const nav = useContext(NavContext);
  if (!nav) throw new Error("SideTabs 안에서만 쓸 수 있어요");
  return nav;
}

const SUBMISSIONS_TAB = "submissions";
const WRITE_TAB = "write";

/**
 * 왼쪽 메뉴 + 오른쪽 넓은 영역 (학생·교사 화면 공용). 고르지 않은 메뉴도 화면에서 숨기기만 하고 그대로 두어서,
 * 탭을 오가도 작성 중인 편집기·실행 결과·펼친 제출이 사라지지 않는다.
 */
export default function SideTabs({
  tabs,
  titles = {},
  rememberAs,
}: {
  tabs: Tab[];
  titles?: Record<string, string>;
  /** 보던 메뉴를 이 이름으로 기억해, 화면이 새로 고쳐져도(새 버전 배포 등) 같은 메뉴로 돌아온다 */
  rememberAs?: string;
}) {
  const [active, setActive] = useState(tabs[0].id);
  const activeRef = useRef(active);
  const storageKey = rememberAs ? `tab:${rememberAs}` : null;
  // 처음 열 때(기억하기보다 먼저 읽어야 함): 이 창에서 보던 메뉴가 있으면 그 메뉴로 (같은 창 안에서만 기억, 로그인하면 처음 화면부터)
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저에만 있는 값을 처음 한 번 읽어 옴
      if (saved && tabs.some((t) => t.id === saved)) setActive(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번만
  }, []);
  useEffect(() => {
    activeRef.current = active;
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, active);
    } catch {}
  }, [active, storageKey]);

  // 탭을 떠날 때 알림 (코드 작성 탭: 제출하지 않은 코드). 막지 않고 이동한 뒤, 사이트 안의 작은 안내로 알려 준다
  const guards = useRef(new Map<string, LeaveGuard>());
  const [notice, setNotice] = useState<{ message: string; from: string } | null>(null);
  const leaveThen = useCallback((go: () => void) => {
    const from = activeRef.current;
    const check = guards.current.get(from)?.();
    go();
    if (!check) return;
    check.onLeave();
    setNotice({ message: check.message, from });
  }, []);
  // 안내는 잠깐 보였다 사라진다. 떠났던 탭으로 돌아오면 바로 지운다
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 10_000);
    return () => clearTimeout(timer);
  }, [notice]);
  const noticeShown = notice && notice.from !== active ? notice : null;

  // 위쪽 로고를 누르면 처음 화면(첫 탭)으로
  const homeTab = tabs[0].id;
  useEffect(() => {
    const goHome = () =>
      leaveThen(() => {
        setActive(homeTab);
        window.scrollTo({ top: 0 });
      });
    window.addEventListener(GO_HOME_EVENT, goHome);
    return () => window.removeEventListener(GO_HOME_EVENT, goHome);
  }, [homeTab, leaveThen]);
  const [selectedProblem, setSelectedProblem] = useState("all");
  const [focusedSubmission, setFocusedSubmission] = useState<number | null>(null);
  const [focusedAt, setFocusedAt] = useState<number | null>(null);
  const [writeTarget, setWriteTarget] = useState<StudentNav["writeTarget"]>(null);

  const nav: StudentNav = {
    selectedProblem,
    setSelectedProblem,
    focusedSubmission,
    focusedAt,
    problemLabel(subject, number) {
      // 연습 문제의 AI 대화 ("P12" = 연습 문제 12번)
      if (/^P\d+$/.test(number)) return `🧪 연습 문제 #${number.slice(1)}`;
      if (/^S\d+$/.test(number)) return `✏️ 학생이 만든 문제 #${number.slice(1)}`;
      const title = titles[`${subject}_${number}`];
      return !title || title === number ? number : `${number}. ${title}`;
    },
    showSubmission(problemKey, submissionId, at) {
      leaveThen(() => {
        setSelectedProblem(problemKey);
        setFocusedSubmission(submissionId);
        setFocusedAt(at ?? null);
        setActive(SUBMISSIONS_TAB);
        window.scrollTo({ top: 0 });
      });
    },
    setLeaveGuard(tabId, guard) {
      if (guard) guards.current.set(tabId, guard);
      else guards.current.delete(tabId);
    },
    showTab(id) {
      leaveThen(() => {
        setActive(id);
        window.scrollTo({ top: 0 });
      });
    },
    writeTarget,
    startWriting(subject, number) {
      setWriteTarget({ subject, number, n: (writeTarget?.n ?? 0) + 1 });
      setActive(WRITE_TAB);
      window.scrollTo({ top: 0 });
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
              tabIndex={active === t.id ? 0 : -1}
              onKeyDown={(e) => {
                // 화살표·Home·End로 메뉴 사이를 옮긴다 (Tab으로는 고른 메뉴 하나에만 멈춘다)
                const i = tabs.findIndex((x) => x.id === t.id);
                const next =
                  e.key === "ArrowDown" || e.key === "ArrowRight"
                    ? tabs[(i + 1) % tabs.length]
                    : e.key === "ArrowUp" || e.key === "ArrowLeft"
                      ? tabs[(i - 1 + tabs.length) % tabs.length]
                      : e.key === "Home"
                        ? tabs[0]
                        : e.key === "End"
                          ? tabs[tabs.length - 1]
                          : null;
                if (!next) return;
                e.preventDefault();
                document.getElementById(`tab-${next.id}`)?.focus();
                if (next.id !== active) leaveThen(() => setActive(next.id));
              }}
              onClick={() => t.id !== active && leaveThen(() => setActive(t.id))}
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
      <ScrollTopButton />
      {noticeShown && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-lg"
        >
          <p className="min-w-0 flex-1 leading-6">{noticeShown.message}</p>
          <button
            type="button"
            onClick={() => {
              setActive(noticeShown.from);
              setNotice(null);
              window.scrollTo({ top: 0 });
            }}
            className="rounded-lg bg-brand px-3 py-1.5 font-bold text-white"
          >
            돌아가기
          </button>
          <button type="button" onClick={() => setNotice(null)} aria-label="안내 닫기" className="px-1 text-muted hover:text-ink">
            ✕
          </button>
        </div>
      )}
    </NavContext>
  );
}
