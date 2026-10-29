"use client";

import { useState } from "react";
import type { Journey as JourneyData, SubmissionSummary } from "@/lib/journey";
import { problemLabel } from "@/lib/problems";
import { formatDuration } from "@/lib/replay";
import ReplaySection from "./ReplaySection";

// 활동 달력 색: 한 가지 색(남색)의 밝기로 많고 적음을 나타낸다. 흑백 인쇄에서도 밝기 차이로 읽힌다.
const HEAT = ["#eceef4", "#c7d2fe", "#818cf8", "#4f46e5", "#3730a3"];
const heatColor = (n: number) => HEAT[Math.min(n, HEAT.length - 1)];

const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", month: "long", day: "numeric", weekday: "short" });
const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));
const shortDay = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const percent = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);

const DAYS_PAGE = 10;

/** 나의 학습 여정: 언제, 무엇을, 어떻게 풀어 왔는지 */
export default function Journey({ journey }: { journey: JourneyData }) {
  const { totals, calendar, weekly, units, days } = journey;
  if (!totals.submissions) {
    return (
      <p className="rounded-xl border border-line bg-white p-5 text-muted">
        아직 제출한 과제가 없어요. 첫 제출을 하면 여기에 나의 학습 여정이 쌓여요.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <Tiles
        items={[
          ["푼 문제", `${totals.problems}문제`],
          ["제출", `${totals.submissions}번`],
          ["공부한 날", `${totals.days}일`],
          ["실제 작업 시간", formatDuration(totals.activeMs)],
          ["직접 작성 비율", percent(totals.typedRatio)],
          ["스스로 고친 오류", `${totals.fixedErrors}번`],
        ]}
      />
      <Card title="📅 활동 달력" note="최근 12주, 칸을 가리키면 그날 제출 수가 보여요">
        <Calendar calendar={calendar} />
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="✍️ 직접 작성 비율" note="주별, 직접 입력 ÷ (직접 입력 + 붙여넣기)">
          <Bars
            data={weekly.map((w) => ({
              label: shortDay(w.weekStart),
              value: w.typedRatio === null ? null : w.typedRatio * 100,
              tip: `${shortDay(w.weekStart)} 주: ${w.typedRatio === null ? "기록 없음" : percent(w.typedRatio)} (제출 ${w.submissions}번)`,
            }))}
            max={100}
            maxLabel="100%"
          />
        </Card>
        <Card title="🔧 스스로 고친 오류" note="주별, 오류가 난 뒤 고쳐서 실행에 성공한 횟수">
          <Bars
            data={weekly.map((w) => ({
              label: shortDay(w.weekStart),
              value: w.submissions ? w.fixedErrors : null,
              tip: `${shortDay(w.weekStart)} 주: ${w.submissions ? `${w.fixedErrors}번` : "제출 없음"}`,
            }))}
            max={Math.max(3, ...weekly.map((w) => w.fixedErrors))}
            maxLabel={`${Math.max(3, ...weekly.map((w) => w.fixedErrors))}번`}
          />
        </Card>
      </div>
      {units.length > 0 && (
        <Card title="⏱ 단원별로 걸린 시간" note="문제 하나에 걸린 실제 작업 시간의 평균. 오래 걸린 단원은 다시 연습해 보면 좋아요">
          <Units units={units} />
        </Card>
      )}
      <Card title="🗓 날짜별 기록" note="문제를 누르면 그때의 작성 과정을 다시 볼 수 있어요">
        <DayList days={days} />
      </Card>
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <div>
        <h3 className="font-bold">{title}</h3>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Tiles({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-xl border border-line bg-white px-4 py-3">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="text-xl font-black tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

function Calendar({ calendar }: { calendar: JourneyData["calendar"] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto">
        <div className="mt-5 flex flex-col gap-1 pr-1 text-[10px] leading-4 text-muted">
          {WEEKDAYS.map((d, i) => (
            <span key={d} className="h-4">
              {i % 2 === 0 ? d : ""}
            </span>
          ))}
        </div>
        {calendar.map((week, w) => (
          <div key={week.weekStart} className="flex flex-col gap-1">
            <span className="h-4 text-[10px] leading-4 text-muted">
              {w === 0 || week.weekStart.slice(8) <= "07" ? `${Number(week.weekStart.slice(5, 7))}월` : ""}
            </span>
            {week.days.map((d) => (
              <span
                key={d.date}
                title={d.future ? undefined : `${formatDay(d.date)}: ${d.count ? `${d.count}번 제출` : "제출 없음"}`}
                className="h-4 w-4 rounded-[3px]"
                style={{ background: d.future ? "transparent" : heatColor(d.count) }}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="flex items-center gap-1 text-[10px] text-muted">
        적음
        {HEAT.map((c, i) => (
          <span key={c} className="h-3 w-3 rounded-[2px]" style={{ background: c }} title={`${i}${i === HEAT.length - 1 ? "번 이상" : "번"}`} />
        ))}
        많음
      </p>
    </div>
  );
}

/** 막대 하나 = 한 주. 값이 없는 주는 막대 대신 점선 자리만 둔다 */
function Bars({
  data,
  max,
  maxLabel,
}: {
  data: { label: string; value: number | null; tip: string }[];
  max: number;
  maxLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex h-32 items-end gap-0.5 border-b border-line">
        <span className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <span className="pointer-events-none absolute -top-2 right-0 bg-white pl-1 text-[10px] text-muted">{maxLabel}</span>
        {data.map((d, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end justify-center" tabIndex={0} aria-label={d.tip}>
            {d.value === null ? (
              <span className="mb-0 h-1 w-full max-w-5 border-b border-dashed border-slate-300" />
            ) : (
              <span
                className="w-full max-w-5 rounded-t bg-brand group-hover:bg-brand-dark"
                style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 1)}%` }}
              />
            )}
            <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white group-hover:block group-focus:block">
              {d.tip}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-0.5 text-[10px] text-muted">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center">
            {i % 3 === 0 || i === data.length - 1 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Units({ units }: { units: JourneyData["units"] }) {
  const max = Math.max(...units.map((u) => u.avgActiveMs), 1);
  const longest = units.reduce((a, b) => (b.avgActiveMs > a.avgActiveMs ? b : a));
  const subjects = new Set(units.map((u) => u.subject)).size;
  return (
    <ul className="flex flex-col gap-2">
      {units.map((u) => (
        <li key={`${u.subject}-${u.unit}`} className="grid grid-cols-[4.5rem_1fr] items-center gap-3 text-sm">
          <span className="font-bold">
            {subjects > 1 && <span className="block text-[10px] font-normal text-muted">{u.subject}</span>}
            {u.unit}단원
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="h-3 rounded-r bg-brand" style={{ width: `${Math.max((u.avgActiveMs / max) * 100, 1)}%` }} />
            <span className="text-xs text-muted">
              평균 {formatDuration(u.avgActiveMs)} · {u.problems}문제 · 실행 오류 {u.runErrors}번
              {u.pauses > 0 && ` · 1분 넘게 멈춤 ${u.pauses}번`}
              {u === longest && units.length > 1 && <b className="ml-1 text-ink">← 가장 오래 걸린 단원</b>}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DayList({ days }: { days: JourneyData["days"] }) {
  const [shown, setShown] = useState(DAYS_PAGE);
  return (
    <div className="flex flex-col gap-4">
      {days.slice(0, shown).map((day) => (
        <div key={day.date} className="flex flex-col gap-1.5">
          <h4 className="text-sm font-bold text-muted">{formatDay(day.date)}</h4>
          <ul className="flex flex-col gap-1.5">
            {day.items.map((s) => (
              <DayItem key={s.id} s={s} />
            ))}
          </ul>
        </div>
      ))}
      {days.length > shown && (
        <button
          type="button"
          onClick={() => setShown(shown + DAYS_PAGE)}
          className="self-center rounded-lg border border-line bg-white px-4 py-2 text-sm text-muted hover:bg-page"
        >
          더 보기 (남은 {days.length - shown}일)
        </button>
      )}
    </div>
  );
}

function DayItem({ s }: { s: SubmissionSummary }) {
  const total = s.typedChars + s.pastedChars;
  const facts = s.hasLog
    ? [
        `실제 작업 ${formatDuration(s.activeMs)}`,
        `실행 ${s.runCount}번${s.runErrorCount ? ` (오류 ${s.runErrorCount})` : ""}`,
        s.fixedErrors ? `🔧 스스로 고침 ${s.fixedErrors}번` : null,
        `삭제·수정 ${s.editCount}번`,
        `직접 작성 ${percent(total ? s.typedChars / total : null)}`,
      ].filter(Boolean)
    : ["작성 기록 없음"];
  return (
    <li>
      <details className="rounded-lg border border-line">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-page">
          <span className="font-bold text-brand">{problemLabel(s.subject, s.problem)}</span>
          <span className="text-xs text-muted">{facts.join(" · ")}</span>
        </summary>
        <div className="border-t border-line p-3">
          {s.hasLog ? <ReplaySection submissionId={s.id} /> : <p className="text-sm text-muted">이 제출은 작성 기록이 없어요.</p>}
        </div>
      </details>
    </li>
  );
}
