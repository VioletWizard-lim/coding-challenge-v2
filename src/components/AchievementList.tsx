"use client";

import { AREAS, type AchievementStatus, type Earned } from "@/lib/achievements";

const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

/**
 * 업적 목록 (학생·교사 화면 공용). 영역별로, 달성한 것은 밝게, 아직인 것은 흐리게 조건과 진행도를 보여 준다.
 * 숨은 업적은 달성 전에는 조건만 감춘다(이름은 보임). 교사 화면(revealHidden)에서는 조건도 보여 준다. onOpen이 있으면 달성한 업적을 눌러 그 순간의 재생으로 간다.
 */
export default function AchievementList({
  list,
  onOpen,
  revealHidden = false,
}: {
  list: AchievementStatus[];
  onOpen?: (earned: Earned) => void;
  /** 교사 화면: 숨은 업적의 조건도 보여 준다 */
  revealHidden?: boolean;
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
                <Item key={a.code} a={a} onOpen={onOpen} revealHidden={revealHidden} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Item({
  a,
  onOpen,
  revealHidden,
}: {
  a: AchievementStatus;
  onOpen?: (earned: Earned) => void;
  revealHidden: boolean;
}) {
  const earnedSteps = a.steps.filter((s) => s.earned);
  const done = earnedSteps.length > 0;
  const latest = earnedSteps.at(-1)?.earned ?? null;
  const next = a.steps.find((s) => !s.earned);
  const multi = a.steps.length > 1;

  // 숨은 업적: 이름은 보여 주고, 조건만 달성할 때까지 감춘다
  if (a.hidden && !done && !revealHidden) {
    return (
      <li className="flex items-start gap-3 rounded-xl border border-dashed border-line bg-white/60 px-4 py-3">
        <span className="text-3xl opacity-30 grayscale" aria-hidden>
          {a.icon}
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="font-bold text-muted">{a.name}</p>
          <p className="text-sm text-muted">❓ 조건은 비밀이에요. 달성하면 공개돼요.</p>
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
        </p>
        {/* 여러 번 달성하는 업적은 메달·레벨 대신 횟수만 담백하게: 5번 ✓ · 20번 · 50번 */}
        {multi && (
          <p className="flex flex-wrap gap-1.5 text-xs">
            {a.steps.map((s, i) => (
              <span
                key={i}
                title={s.desc}
                className={`rounded-full px-2 py-0.5 ${s.earned ? "bg-green-50 font-bold text-green-700" : "bg-page text-muted"}`}
              >
                {s.target}
                {a.unit}
                {s.earned ? " ✓" : ""}
              </span>
            ))}
          </p>
        )}
        <p className="text-sm text-muted">{next ? next.desc : a.steps.at(-1)!.desc}</p>
        {revealHidden && a.hidden && !done && <span className="text-xs text-muted">🔒 학생에게는 조건이 숨겨져 있어요</span>}
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
