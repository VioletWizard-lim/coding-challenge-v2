"use client";

import { AREAS, type AchievementStatus, type Earned } from "@/lib/achievements";

const TIER_BADGE = ["🥉", "🥈", "🥇"];
const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

/**
 * 업적 목록 (학생·교사 화면 공용). 영역별로, 달성한 것은 밝게, 아직인 것은 흐리게 조건과 진행도를 보여 준다.
 * 숨은 업적은 달성 전에는 이름·조건을 감춘다. onOpen이 있으면 달성한 업적을 눌러 그 순간의 재생으로 간다.
 */
export default function AchievementList({
  list,
  onOpen,
}: {
  list: AchievementStatus[];
  onOpen?: (earned: Earned) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {AREAS.map((area) => {
        const items = list.filter((a) => a.area === area.id);
        if (!items.length) return null;
        return (
          <section key={area.id} className="flex flex-col gap-2">
            <h3 className="font-bold">{area.label}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <Item key={a.code} a={a} onOpen={onOpen} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Item({ a, onOpen }: { a: AchievementStatus; onOpen?: (earned: Earned) => void }) {
  const earnedSteps = a.steps.filter((s) => s.earned);
  const done = earnedSteps.length > 0;
  const latest = earnedSteps.at(-1)?.earned ?? null;
  const next = a.steps.find((s) => !s.earned);
  const multi = a.steps.length > 1;

  if (a.hidden && !done) {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-white/60 px-4 py-3">
        <span className="text-2xl opacity-40" aria-hidden>
          ❓
        </span>
        <div className="text-sm text-muted">
          <p className="font-bold">숨은 업적</p>
          <p>어떤 업적일까요? 계속 해 보면 나타나요.</p>
        </div>
      </li>
    );
  }

  const clickable = !!(onOpen && latest?.submissionId);
  const body = (
    <>
      <span className={`text-3xl ${done ? "" : "opacity-30 grayscale"}`} aria-hidden>
        {a.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className={`font-bold ${done ? "text-ink" : "text-muted"}`}>
          {a.name}
          {multi && (
            <span className="ml-1.5 tracking-wider">
              {a.steps.map((s, i) => (
                <span key={i} className={s.earned ? "" : "opacity-25 grayscale"} title={s.desc}>
                  {a.steps.length === 3 ? TIER_BADGE[i] : i === 0 ? "⭐" : "🌟"}
                </span>
              ))}
            </span>
          )}
        </p>
        <p className="text-sm text-muted">{next ? next.desc : a.steps.at(-1)!.desc}</p>
        {next?.target && a.current !== null && (
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-page">
              <span
                className="block h-full rounded-full bg-brand"
                style={{ width: `${Math.min(100, (a.current / next.target) * 100)}%` }}
              />
            </span>
            <span className="text-xs text-muted">
              {a.current} / {next.target}
            </span>
          </div>
        )}
        {!next?.target && !done && a.code === "unit_master" && a.current ? (
          <span className="text-xs text-muted">가장 많이 푼 단원 {a.current}%</span>
        ) : null}
        {latest && (
          <span className="text-xs text-green-700">
            {dayFormat.format(new Date(latest.earnedAt))} 달성{clickable ? " · 누르면 그 순간을 다시 봐요" : ""}
          </span>
        )}
      </div>
    </>
  );

  const box = `flex items-start gap-3 rounded-xl border px-4 py-3 text-left ${
    done ? "border-amber-200 bg-amber-50/60" : "border-line bg-white"
  }`;
  return (
    <li>
      {clickable ? (
        <button type="button" onClick={() => onOpen!(latest!)} className={`${box} w-full hover:border-brand`}>
          {body}
        </button>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}
