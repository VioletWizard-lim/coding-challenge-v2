"use client";

import { useEffect, useState, useTransition } from "react";
import { MAX_AI_NOTE, type AiSettings } from "@/lib/aiSettings";
import { loadAiSettings, saveSubjectAi } from "./actions";

/**
 * ⚙️ 설정 → 🤖 AI 기능: 과목마다 AI 도우미·AI 되돌아보기 켜고 끄기, 수행평가처럼 AI 도우미를 끌 단원, 선생님 지침.
 * 저장된 것이 없으면 모두 켜짐.
 */
export default function AiSettingsPanel() {
  const [data, setData] = useState<{ ready: boolean; settings: AiSettings[]; units: Record<string, string[]> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAiSettings().then((r) => (r.ok ? setData(r) : setError(r.message)));
  }, []);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">🤖 AI 기능</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          과목마다 학생 AI 기능을 켜고 끌 수 있어요. 수행평가처럼 AI 없이 풀어야 하는 단원은 그 단원만 AI 도우미를 끄세요. 끄면 학생 화면에
          &lsquo;선생님이 꺼 두었어요&rsquo;라고 나와요. 선생님 지침은 AI 도우미와 되돌아보기에 함께 전해져요(안전 지침과 &lsquo;정답을 주지
          않는다&rsquo;는 규칙보다 앞서지는 않아요).
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {data && !data.ready && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 켜고 끄려면 Supabase SQL Editor에서 <code>supabase/migrations/017_ai_settings.sql</code>을 실행해 주세요. 그전에는 모든 AI 기능이
          켜져 있어요.
        </p>
      )}
      {!data && !error && <p className="text-sm text-muted">불러오는 중…</p>}
      {data?.ready &&
        data.settings.map((s) => (
          <SubjectAi
            key={s.subject}
            settings={s}
            units={data.units[s.subject] ?? []}
            onSaved={(next) => setData((d) => d && { ...d, settings: d.settings.map((x) => (x.subject === s.subject ? next : x)) })}
          />
        ))}
    </section>
  );
}

function SubjectAi({ settings, units, onSaved }: { settings: AiSettings; units: string[]; onSaved: (s: AiSettings) => void }) {
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = JSON.stringify(draft) !== JSON.stringify(settings);
  // 문제가 없어진 단원도 꺼 둔 채로 남아 있으면 보이게
  const allUnits = [...new Set([...units, ...draft.offUnits])].sort((a, b) => Number(a) - Number(b));

  function save() {
    setMessage(null);
    startTransition(async () => {
      const r = await saveSubjectAi(draft);
      if (!r.ok) return setMessage({ text: r.message, ok: false });
      setDraft(r.settings);
      onSaved(r.settings);
      setMessage({ text: "저장했어요. 학생 화면에 바로 적용돼요.", ok: true });
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line px-4 py-3">
      <h3 className="font-bold">{settings.subject}</h3>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={draft.helper} onChange={(e) => setDraft((d) => ({ ...d, helper: e.target.checked }))} />
          🤖 AI 도우미 (코드 작성·연습 중 질문)
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={draft.review} onChange={(e) => setDraft((d) => ({ ...d, review: e.target.checked }))} />
          🔁 AI 되돌아보기 (제출 뒤)
        </label>
      </div>
      <fieldset className="flex flex-col gap-1.5" disabled={!draft.helper}>
        <legend className="text-sm text-muted">AI 도우미를 끌 단원 (예: 수행평가 단원) — 연습 모드에는 적용되지 않아요</legend>
        {allUnits.length ? (
          <div className="flex flex-wrap gap-1.5">
            {allUnits.map((u) => {
              const off = draft.offUnits.includes(u);
              return (
                <button
                  key={u}
                  type="button"
                  aria-pressed={off}
                  onClick={() => setDraft((d) => ({ ...d, offUnits: off ? d.offUnits.filter((x) => x !== u) : [...d.offUnits, u] }))}
                  className={`rounded-full border px-3 py-1 text-sm disabled:opacity-40 ${
                    off ? "border-rose-300 bg-rose-50 font-bold text-rose-800" : "border-line text-muted hover:border-brand"
                  }`}
                >
                  {off ? "🚫 " : ""}
                  {u}단원
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">이 과목에 올린 문제가 아직 없어요.</p>
        )}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm text-muted">
        선생님 지침 (선택, AI 도우미·되돌아보기에 함께 전해짐)
        <textarea
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          maxLength={MAX_AI_NOTE}
          rows={2}
          placeholder="예: 아직 f-string은 안 배웠어요. 출력은 print()에 쉼표로 이어서 쓰도록 안내해 주세요."
          className="rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !changed} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {pending ? "저장 중…" : "저장"}
        </button>
        {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-danger"}`}>{message.text}</p>}
      </div>
    </div>
  );
}
