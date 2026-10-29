import { REFLECTION_FIELDS, type Reflection } from "@/lib/reflection";

/** 쓴 성찰을 학습지 칸 순서대로 보여 준다 (빈 칸은 숨김). 학생 학습 여정과 교사 화면이 함께 쓴다 */
export default function ReflectionView({ reflection: r, hardestLabel }: { reflection: Reflection; hardestLabel: string }) {
  const rows: [string, string][] = [
    ["가장 어려웠던 문제", r.hardestProblem ? hardestLabel : ""],
    [REFLECTION_FIELDS.hardestReason, r.hardestReason],
    [REFLECTION_FIELDS.aiQuestions, r.aiQuestions],
    [REFLECTION_FIELDS.keyConcepts, r.keyConcepts],
  ];
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[9rem_1fr]">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-bold text-muted">{label}</dt>
            <dd className="whitespace-pre-wrap break-words">{value}</dd>
          </div>
        ))}
    </dl>
  );
}
