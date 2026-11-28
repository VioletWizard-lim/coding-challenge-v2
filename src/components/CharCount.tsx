/** 입력칸 아래 글자 수 ("57/300"). 거의 다 차면 색으로 알린다 */
export default function CharCount({ value, max, hint }: { value: string; max: number; hint?: string }) {
  const n = value.length;
  return (
    <p className="flex gap-2 text-xs text-muted">
      {hint && <span className="min-w-0 flex-1">{hint}</span>}
      <span className={`ml-auto shrink-0 tabular-nums ${n >= max ? "font-bold text-danger" : n >= max * 0.9 ? "font-bold text-amber-700" : ""}`} aria-live="polite">
        {n}/{max}자
      </span>
    </p>
  );
}
