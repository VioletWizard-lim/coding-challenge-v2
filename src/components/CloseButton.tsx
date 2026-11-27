/** 단추로 연 창·칸의 오른쪽 위 ✕ 닫기 (열린 것을 한눈에 알고 바로 닫을 수 있게) */
export default function CloseButton({ onClick, label = "닫기", disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1 text-sm text-muted hover:border-danger hover:text-danger disabled:opacity-40"
    >
      <span aria-hidden className="font-bold">✕</span> {label}
    </button>
  );
}
