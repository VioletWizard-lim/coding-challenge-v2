"use client";

import { phraseProgress, samePhrase } from "@/lib/confirmPhrase";

/**
 * 되돌리기 어려운 일(지우기) 전에 확인 문구를 적는 칸. 적어야 할 문구를 칸 위에 늘 보여 주고(입력하는 동안 사라지지 않게),
 * 적는 동안 글자마다 맞았는지 색으로 알려 준다. 맞는지는 samePhrase(서버와 같은 기준)로 본다.
 */
export default function ConfirmPhrase({
  phrase,
  value,
  onChange,
  label = "확인 문구",
}: {
  phrase: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const { chars, extra } = phraseProgress(value, phrase);
  const ok = samePhrase(value, phrase);
  const typed = value.trim() !== "";
  return (
    <div className="flex min-w-64 flex-col gap-1.5">
      <p className="text-sm">
        아래 칸에{" "}
        <span className="rounded bg-page px-1.5 py-0.5 font-mono font-bold text-ink" aria-hidden>
          {chars.map((c, i) => (
            <span
              key={i}
              className={c.state === "ok" ? "text-green-700" : c.state === "wrong" ? "bg-red-100 text-danger underline" : "text-ink"}
            >
              {c.ch}
            </span>
          ))}
        </span>
        <span className="sr-only">{phrase}</span> 라고 똑같이 적어 주세요.
      </p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label}: ${phrase}`}
        placeholder={phrase}
        autoComplete="off"
        spellCheck={false}
        className={`rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 ${
          ok ? "border-green-600 focus:ring-green-600/20" : typed && (extra || chars.some((c) => c.state === "wrong")) ? "border-danger focus:ring-danger/20" : "border-line focus:border-brand focus:ring-brand/15"
        }`}
      />
      <p className="min-h-4 text-xs" aria-live="polite">
        {ok ? (
          <span className="text-green-700">✓ 맞게 적었어요</span>
        ) : extra ? (
          <span className="text-danger">문구보다 더 적었어요</span>
        ) : chars.some((c) => c.state === "wrong") ? (
          <span className="text-danger">빨간 글자가 달라요</span>
        ) : typed ? (
          <span className="text-muted">계속 적어 주세요</span>
        ) : null}
      </p>
    </div>
  );
}
