"use client";

import { useEffect, useState, useTransition } from "react";
import { loadTrialPage, saveTrialPage, type TrialPageInfo } from "./actions";

/**
 * 🧪 체험 페이지(/try) 보이기/숨기기. 숨기면 첫 화면의 체험 버튼이 사라지고, /try는 "열려 있지 않아요"(관리자는 미리 보기),
 * 체험 AI도 막힌다. 심사 기간 등 필요할 때만 열어 두기.
 */
export default function TrialPageCard() {
  const [info, setInfo] = useState<Extract<TrialPageInfo, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    loadTrialPage().then((r) => (r.ok ? setInfo(r) : setError(r.message)));
  }, []);

  function toggle(visible: boolean) {
    startTransition(async () => {
      const r = await saveTrialPage(visible);
      if (!r.ok) return setError(r.message);
      setError(null);
      const next = await loadTrialPage();
      if (next.ok) setInfo(next);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">🧪 체험 페이지</h2>
        {info && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${info.visible ? "bg-green-100 text-green-800" : "bg-page text-muted"}`}>
            {info.visible ? "보이는 중" : "숨김"}
          </span>
        )}
        {info && (
          <button
            type="button"
            role="switch"
            aria-checked={info.visible}
            aria-label="체험 페이지 보이기"
            disabled={pending}
            onClick={() => toggle(!info.visible)}
            className={`relative ml-auto h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${info.visible ? "bg-green-600" : "bg-gray-300"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${info.visible ? "left-6" : "left-1"}`} />
          </button>
        )}
      </div>
      <p className="text-sm leading-6 text-muted">
        로그인 없이 수업 흐름(코드 쓰기 → 재생하며 AI와 되돌아보기 → 성찰)을 체험하는 페이지예요(<code>/try</code>, 저장 안 함). 심사 기간처럼 필요할 때만
        보이게 하세요. <b>숨기면</b> 첫 화면의 &ldquo;🧪 로그인 없이 체험해 보기&rdquo; 버튼이 사라지고, 주소로 들어와도 &ldquo;열려 있지 않아요&rdquo;가 나오며
        체험 AI도 막혀요. 관리자 계정으로는 숨김 상태에서도{" "}
        <a href="/try" target="_blank" className="font-bold text-brand underline">
          미리 보기
        </a>
        할 수 있어요.
      </p>
      {info && (
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            {info.codeSet && info.aiReady ? "✅" : "⚠️"} 진짜 AI(체험 코드):{" "}
            {!info.aiReady
              ? "AI 키가 없어 꺼져 있어요"
              : info.codeSet
                ? "켜짐 — Vercel 환경변수 TRY_ACCESS_CODE의 코드를 심사위원 안내문에 적어 주세요"
                : "꺼짐 — Vercel 환경변수 TRY_ACCESS_CODE를 정하면 켜져요 (없으면 예시 기록·코드 쓰기·재생만)"}
          </li>
          <li>
            📊 오늘 체험 AI: {info.remaining === null ? "확인하지 못함" : `${info.limit - info.remaining}번 씀 · ${info.remaining}번 남음`} (사이트 전체 하루{" "}
            {info.limit}번, TRY_AI_DAILY_LIMIT)
          </li>
        </ul>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
