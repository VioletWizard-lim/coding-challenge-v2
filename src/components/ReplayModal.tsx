"use client";

import type { Recording } from "@/lib/editLog";
import Replayer from "./Replayer";
import { useDialog } from "./useDialog";

/**
 * 작성 기록의 한 순간·한 구간을 겹쳐 뜨는 창으로 다시 보기 (AI 도우미의 되물음, 막힘 알림 공용).
 * end가 있으면 그 시각까지만 재생하고 멈춘다. Esc·바깥 누르기로 닫힌다.
 */
export default function ReplayModal({
  rec,
  at,
  end,
  label,
  onClose,
}: {
  rec: Recording;
  at: number;
  end?: number;
  label: string;
  onClose: () => void;
}) {
  const dialog = useDialog<HTMLDivElement>(true, onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="이 순간의 재생"
        className="mt-10 flex w-full max-w-4xl flex-col gap-3 rounded-xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center gap-2">
          <h3 className="font-bold">⏪ {label} — 이 순간의 재생</h3>
          <button type="button" onClick={onClose} className="ml-auto text-sm text-muted hover:text-ink">
            ✕ 닫기
          </button>
        </div>
        {end !== undefined && <p className="text-sm text-muted">이 구간만 보여 줘요. ▶ 재생을 누르면 구간 끝에서 멈춰요.</p>}
        <Replayer init={rec.init} code={rec.code} log={rec.log} startAt={at} endAt={end} />
      </div>
    </div>
  );
}
