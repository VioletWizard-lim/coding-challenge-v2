"use client";

import { useEffect, useState, useTransition } from "react";
import { loadTrialPage, saveTrialAi, saveTrialPage, type TrialPageInfo } from "./actions";

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
    run(() => saveTrialPage(visible));
  }

  function toggleAi(on: boolean) {
    if (!on && !confirm("체험 AI를 끌까요? 이미 체험 코드를 넣은 사람도 바로 쓸 수 없게 되고, 다시 켜면 코드를 새로 넣어야 해요.")) return;
    run(() => saveTrialAi(on));
  }

  function run(save: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    startTransition(async () => {
      const r = await save();
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
        <div className="flex flex-col gap-2 rounded-lg border border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <p className="font-bold">🤖 체험 AI</p>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                info.aiOn && info.codeSet && info.aiReady ? "bg-green-100 text-green-800" : "bg-page text-muted"
              }`}
            >
              {!info.aiOn ? "꺼 둠" : info.codeSet && info.aiReady ? "켜짐" : "준비 안 됨"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={info.aiOn}
              aria-label="체험 AI 켜기"
              disabled={pending}
              onClick={() => toggleAi(!info.aiOn)}
              className={`relative ml-auto h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${info.aiOn ? "bg-green-600" : "bg-gray-300"}`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${info.aiOn ? "left-6" : "left-1"}`} />
            </button>
          </div>
          <p className="text-sm leading-6 text-muted">
            체험 코드를 넣은 사람이 AI 도우미·되돌아보기·연습 문제를 진짜 AI로 써요. <b>끄면</b> 다시 배포하지 않아도 바로 막히고, 이미 코드를 넣은 브라우저도
            함께 막혀요(다시 켜면 코드를 새로 넣어야 해요). 체험 페이지의 코드 쓰기·재생·예시 기록은 그대로 보여요.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {!info.aiReady && <li>⚠️ AI 키(ANTHROPIC_API_KEY)가 없어 쓸 수 없어요.</li>}
            {!info.codeSet && (
              <li>⚠️ 체험 코드가 없어요. Vercel → Settings → Environment Variables에 TRY_ACCESS_CODE를 넣고 Redeploy 하면 쓸 수 있어요.</li>
            )}
            <li>
              📊 오늘 체험 AI: {info.remaining === null ? "확인하지 못함" : `${info.limit - info.remaining}번 씀 · ${info.remaining}번 남음`} (사이트 전체 하루{" "}
              {info.limit}번)
            </li>
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
