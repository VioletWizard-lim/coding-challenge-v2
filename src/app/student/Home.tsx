"use client";

import { useStudentNav } from "@/components/SideTabs";
import { ACHIEVEMENTS_TAB } from "@/lib/achievements";
import type { Journey } from "@/lib/journey";
import { formatDuration, type ReplayStats } from "@/lib/replay";
import ReplaySection from "./ReplaySection";

export type HomeData = {
  today: string;
  /** 과목마다 다음에 풀 문제: 공개된 문제 중 아직 제출하지 않은 첫 문제 */
  subjects: { subject: string; next: string | null; unsolvedCount: number; openCount: number }[];
  todaySubs: { subject: string; problem: string }[];
  /** 오늘의 성찰을 썼는지 (성찰 기능이 준비 전이면 null) */
  reflectedToday: boolean | null;
  /** 가장 최근에 작성 기록이 있는 제출 */
  recent: { id: number; subject: string; problem: string; date: string; stats: ReplayStats } | null;
  totals: Journey["totals"];
  achievedCount: number;
  recentAchievements: { icon: string; name: string; earnedAt: string }[];
};

const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", month: "long", day: "numeric", weekday: "short" });
const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));
const percent = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);

/** 학생 첫 화면: 오늘 할 일 → 최근 제출 다시 보기 → 학습 여정·업적 요약 */
export default function Home({ name, data }: { name: string; data: HomeData }) {
  const { startWriting, showTab, problemLabel } = useStudentNav();
  const { totals } = data;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-black">{name}님, 안녕하세요! 👋</h2>
        <p className="text-muted">{formatDay(data.today)} · 오늘도 내 손으로 한 줄씩 써 봐요.</p>
      </div>

      <Card title="✅ 오늘 할 일">
        <ul className="flex flex-col gap-3">
          {data.subjects.map((s) => (
            <li key={s.subject} className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-soft/50 px-4 py-3">
              <div className="mr-auto">
                <p className="text-sm text-muted">
                  <b className="text-ink">{s.subject}</b> · 다음에 풀 문제
                </p>
                {s.next ? (
                  <>
                    <p className="text-lg font-bold text-brand">{problemLabel(s.subject, s.next)}</p>
                    <p className="text-xs text-muted">
                      공개된 {s.openCount}문제 중 아직 안 낸 문제 {s.unsolvedCount}개
                    </p>
                  </>
                ) : (
                  <p className="font-bold">
                    {s.openCount ? "🎉 공개된 문제를 모두 냈어요! 고쳐서 다시 내 봐도 좋아요." : "아직 공개된 문제가 없어요."}
                  </p>
                )}
              </div>
              {s.openCount > 0 && (
                <button
                  type="button"
                  onClick={() => (s.next ? startWriting(s.subject, s.next) : showTab("write"))}
                  className="rounded-lg bg-brand px-5 py-2.5 font-bold text-white"
                >
                  📝 {s.next ? "이 문제 풀러 가기" : "코드 작성하러 가기"} →
                </button>
              )}
            </li>
          ))}
          <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm">
            <span className="font-bold">오늘 제출</span>
            {data.todaySubs.length ? (
              data.todaySubs.map((s) => (
                <span key={`${s.subject}_${s.problem}`} className="rounded-full bg-page px-2.5 py-0.5">
                  {data.subjects.length > 1 && `${s.subject} `}
                  {problemLabel(s.subject, s.problem)}
                </span>
              ))
            ) : (
              <span className="text-muted">아직 없어요</span>
            )}
          </li>
          {data.reflectedToday !== null && (
            <li className="flex flex-wrap items-center gap-3 px-1 text-sm">
              <span className="font-bold">오늘의 성찰</span>
              {data.reflectedToday ? (
                <span className="text-green-700">✅ 썼어요</span>
              ) : (
                <>
                  <span className="text-muted">수업을 마치고 오늘을 돌아보며 써요</span>
                  <button type="button" onClick={() => showTab("reflection")} className="font-bold text-brand hover:underline">
                    💭 성찰 쓰러 가기 →
                  </button>
                </>
              )}
            </li>
          )}
        </ul>
      </Card>

      {data.recent && (
        <Card
          title="▶ 내 기록 다시 보기"
          note={`최근 제출 · ${formatDay(data.recent.date)} · ${problemLabel(data.recent.subject, data.recent.problem)} — 내가 어떻게 썼는지 돌아봐요`}
          action={{ label: "모든 기록 보기 →", onClick: () => showTab("submissions") }}
          highlight
        >
          <ReplaySection key={data.recent.id} submissionId={data.recent.id} />
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="🧭 나의 학습 여정" action={{ label: "전체 보기 →", onClick: () => showTab("journey") }}>
          {totals.submissions ? (
            <dl className="grid grid-cols-2 gap-3">
              {[
                ["푼 문제", `${totals.problems}문제`],
                ["공부한 날", `${totals.days}일`],
                ["직접 작성 비율", percent(totals.typedRatio)],
                ["스스로 고친 오류", `${totals.fixedErrors}번`],
                ["실제 작업 시간", formatDuration(totals.activeMs)],
                ["제출", `${totals.submissions}번`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-page px-3 py-2">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="text-lg font-bold">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted">첫 제출을 하면 여기에 나의 학습 여정이 쌓여요.</p>
          )}
        </Card>
        <Card title="🏅 업적" action={{ label: "전체 보기 →", onClick: () => showTab(ACHIEVEMENTS_TAB) }}>
          <p className="mb-3 text-sm text-muted">지금까지 {data.achievedCount}개를 달성했어요.</p>
          {data.recentAchievements.length ? (
            <ul className="flex flex-col gap-2">
              {data.recentAchievements.map((a) => (
                <li key={`${a.name}_${a.earnedAt}`} className="flex items-center gap-3 rounded-lg bg-amber-50/60 px-3 py-2">
                  <span className="text-2xl" aria-hidden>
                    {a.icon}
                  </span>
                  <span className="font-bold">{a.name}</span>
                  <span className="ml-auto text-xs text-muted">{formatDay(a.earnedAt.slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">코드를 쓰다 보면 업적이 하나씩 생겨요.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  note,
  action,
  highlight = false,
  children,
}: {
  title: string;
  note?: string;
  action?: { label: string; onClick: () => void };
  /** 핵심 기능(재생) 카드: 테두리와 제목을 강조 */
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-xl bg-white p-5 ${highlight ? "border-2 border-brand/50 shadow-sm" : "border border-line"}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className={highlight ? "text-lg font-black text-brand" : "font-bold"}>{title}</h3>
        {note && <p className="text-sm text-muted">{note}</p>}
        {action && (
          <button type="button" onClick={action.onClick} className="ml-auto text-sm font-bold text-brand hover:underline">
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
