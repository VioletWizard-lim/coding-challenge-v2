"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AchievementList from "@/components/AchievementList";
import { useStudentNav } from "@/components/SideTabs";
import { ACHIEVEMENTS_TAB, earnedKeys, type AchievementStatus } from "@/lib/achievements";
const TOAST_MS = 10_000;

/**
 * 학생 업적 탭 + 새 업적 알림. "이미 본 업적"은 이 브라우저에 기억해 두고(localStorage),
 * 제출 뒤 새로 달성한 업적이 생기면 화면 위쪽에 알림을 띄운다.
 */
export default function Achievements({ userId, list }: { userId: string; list: AchievementStatus[] }) {
  const { showSubmission, showTab } = useStudentNav();
  const [toast, setToast] = useState<string | null>(null);

  const keys = earnedKeys(list);
  const signature = keys.join(",");
  useEffect(() => {
    const storageKey = `ach_seen:${userId}`;
    let seen: string[] | null = null;
    try {
      seen = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    } catch {
      seen = null;
    }
    const current = signature ? signature.split(",") : [];
    const fresh = current.filter((k) => !seen?.includes(k));
    try {
      localStorage.setItem(storageKey, JSON.stringify(current));
    } catch {
      // 저장이 막힌 브라우저면 알림만 건너뛴다
    }
    if (!fresh.length) return;
    const names = fresh.map((k) => list.find((a) => a.code === k.split(":")[0])!).map((a) => `${a.icon} ${a.name}`);
    const text =
      seen === null
        ? `지금까지의 기록으로 업적 ${current.length}개를 달성했어요!`
        : `새 업적: ${[...new Set(names)].join(", ")}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저에 기억한 값과 비교한 뒤에야 알 수 있다
    setToast(text);
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 달성 목록이 바뀔 때만
  }, [userId, signature]);

  const doneCount = list.filter((a) => a.steps.some((s) => s.earned)).length;
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">🏅 업적</h2>
        <p className="text-sm text-muted">
          코드를 쓰는 과정에서 잘한 순간을 모아 둬요. 지금까지 {doneCount}개를 달성했어요. 달성한 업적을 누르면 그
          순간의 작성 과정을 다시 볼 수 있어요.
        </p>
      </div>
      <AchievementList
        list={list}
        onOpen={(e) => e.submissionId && showSubmission(`${e.subject}_${e.problem}`, e.submissionId, e.at)}
      />
      {toast &&
        createPortal(
          <div
            role="status"
            className="fixed top-16 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg"
          >
            <span className="text-2xl" aria-hidden>
              🎉
            </span>
            <span className="text-sm font-bold">{toast}</span>
            <button
              type="button"
              onClick={() => {
                setToast(null);
                showTab(ACHIEVEMENTS_TAB);
              }}
              className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white"
            >
              보러 가기
            </button>
            <button type="button" onClick={() => setToast(null)} aria-label="알림 닫기" className="shrink-0 px-1 text-muted">
              ✕
            </button>
          </div>,
          document.body,
        )}
    </section>
  );
}
