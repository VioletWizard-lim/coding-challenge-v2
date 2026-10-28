import { problemLabel } from "@/lib/problems";
import { listMySubmissions, type MySubmission } from "@/lib/submissions";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const isGraded = (s: MySubmission) => s.score_total !== null || Boolean(s.feedback);

/** 만점이 아닌 영역 (v1과 같이 기능·코드 설명만, 도전은 가산점이라 빼고) */
function deductedAreas(s: MySubmission) {
  if (!isGraded(s)) return [];
  const areas: string[] = [];
  if (s.score_function !== null && s.score_function < 40) areas.push("기능");
  if (s.score_understanding !== null && s.score_understanding < 40) areas.push("코드 설명");
  return areas;
}

/** 내 제출 현황: 점수·선생님 피드백·오답 이유·제출한 코드 */
export default async function MySubmissions({ name }: { name: string }) {
  let rows: MySubmission[];
  try {
    rows = await listMySubmissions(name);
  } catch (err) {
    console.error(err);
    return <p className="text-danger">제출 현황을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  if (!rows.length) return <p className="rounded-xl border border-line bg-white p-5 text-muted">아직 제출한 과제가 없어요.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((s) => (
        <li key={s.id}>
          <details className="group rounded-xl border border-line bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
              <span className="font-bold text-brand">{problemLabel(s.subject, s.problem)}</span>
              {s.wrong_reason && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-danger">⚠️ 오답</span>
              )}
              {deductedAreas(s).length > 0 && (
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700">
                  📉 감점: {deductedAreas(s).join(" · ")}
                </span>
              )}
              <span className="text-sm text-muted">{timeFormat.format(new Date(s.submitted_at))}</span>
              <span className="ml-auto">
                {isGraded(s) ? (
                  <b className="text-lg text-brand">{s.score_total ?? 0}점</b>
                ) : (
                  <span className="text-sm text-muted">채점 중</span>
                )}
              </span>
              <span className="text-muted transition group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
              {isGraded(s) && (
                <div className="flex flex-wrap gap-2">
                  <Score label="기능" value={s.score_function} max={40} />
                  <Score label="코드 설명" value={s.score_understanding} max={40} />
                  <Score label="도전" value={s.score_challenge} max={20} />
                  <Score label="합계" value={s.score_total} max={100} strong />
                </div>
              )}
              {s.feedback && <Note tone="amber">💬 선생님 피드백: {s.feedback}</Note>}
              {s.wrong_reason && <Note tone="red">⚠️ 오답 이유: {s.wrong_reason}</Note>}
              {s.description && <p className="text-sm text-muted">내 설명: {s.description}</p>}
              <pre className="max-h-80 overflow-auto rounded-lg bg-page p-3 font-[family-name:var(--font-code)] text-sm">
                {s.code}
              </pre>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function Score({ label, value, max, strong }: { label: string; value: number | null; max: number; strong?: boolean }) {
  return (
    <div className={`rounded-lg px-3.5 py-2 text-center ${strong ? "bg-brand text-white" : "bg-page"}`}>
      <div className={`text-xs ${strong ? "text-indigo-200" : "text-muted"}`}>{label}</div>
      <div className="font-bold">
        {value ?? 0}
        <span className={`text-xs ${strong ? "text-indigo-200" : "text-muted"}`}>/{max}</span>
      </div>
    </div>
  );
}

function Note({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  const color = tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-danger";
  return <p className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${color}`}>{children}</p>;
}
