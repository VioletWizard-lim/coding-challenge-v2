"use client";

import { useEffect, useMemo, useState } from "react";
import { beforeAfter, choices, introMonth, monthlySeries, type MonthPoint, type Period } from "@/lib/effectStats";
import type { StatRow } from "@/lib/yearEnd";

const inputClass = "rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

type Metric = { key: "typedPct" | "fixedPer" | "reflectPct" | "minutesPer"; title: string; unit: string; max?: number; help: string };

/** 보고서에 쓸 네 가지 변화 (모두 "과정"을 보는 숫자) */
const METRICS: Metric[] = [
  { key: "typedPct", title: "직접 작성 비율", unit: "%", max: 100, help: "직접 입력한 글자 ÷ (직접 입력 + 붙여넣은 글자)" },
  { key: "fixedPer", title: "오류를 스스로 고쳐 다시 성공", unit: "번", help: "오류가 난 뒤 다시 실행해 성공한 횟수, 제출 하나당 (새 사이트부터 기록)" },
  { key: "reflectPct", title: "성찰 작성률", unit: "%", max: 100, help: "오늘의 성찰을 쓴 학생 ÷ 제출한 학생 (월별, 새 사이트부터)" },
  { key: "minutesPer", title: "제출 하나에 들인 실제 작업 시간", unit: "분", help: "오래 멈춘 시간을 뺀 작성 시간, 제출 하나당" },
];

const monthLabel = (m: string) => `${m.slice(2, 4)}.${Number(m.slice(5))}`;
const fmt = (v: number | null, unit: string) => (v === null ? "—" : `${v.toLocaleString()}${unit}`);

type Loaded = { year: number; kept: boolean; rows: StatRow[] };

/**
 * 📈 수업 효과 (이름 없는 통계, 보고서 캡처용). 학년도를 골라 계산하면 월 × 과목 × 반의 숫자만 받아
 * 과목·반으로 골라 월별 변화와 새 사이트 도입 전후를 보여 준다. 학년도 말 정리로 기록을 지운 해도 남겨 둔 통계로 보인다.
 */
export default function EffectStats() {
  const [years, setYears] = useState<{ current: number; years: number[]; saved: number[] } | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [loaded, setLoaded] = useState<Loaded[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [cls, setCls] = useState("");
  const [intro, setIntro] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/effect-stats")
      .then((r) => r.json())
      .then((x) => {
        if (x.error) return setError(x.error);
        setYears(x);
        setPicked([x.current - 1, x.current].filter((y) => x.years.includes(y)));
      })
      .catch(() => setError("학년도 목록을 불러오지 못했어요."));
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await Promise.all(
        [...picked].sort().map(async (y) => {
          const r = await fetch(`/api/teacher/effect-stats?year=${y}`);
          const x = await r.json();
          if (!r.ok) throw new Error(x.error ?? "통계를 만들지 못했어요.");
          return x as Loaded;
        }),
      );
      setLoaded(list);
      setIntro(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => (loaded ?? []).flatMap((l) => l.rows), [loaded]);
  const opts = useMemo(() => choices(rows, subject), [rows, subject]);
  const pickedCls = opts.classes.includes(cls) ? cls : "";
  const points = useMemo(() => monthlySeries(rows, subject, pickedCls), [rows, subject, pickedCls]);
  const autoIntro = introMonth(points);
  const introAt = intro && points.some((p) => p.month === intro) ? intro : autoIntro;
  const { before, after } = beforeAfter(points, introAt);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">📈 수업 효과 (이름 없는 통계)</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          월 × 과목 × 반의 <b>숫자만</b> 모아 보여 줘요(이름·아이디 없음). 보고서·연구 자료로 캡처해 쓰세요. 학년도 말 정리로 기록을 지운 해도
          그때 남겨 둔 통계로 계속 보여요. 작성 기록을 모두 읽어 계산하므로 1~2분 걸릴 수 있어요.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold">학년도</span>
        {years?.years.map((y) => (
          <label key={y} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={picked.includes(y)}
              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, y] : p.filter((x) => x !== y)))}
            />
            {y}학년도{y === years.current && " (올해)"}
            {years.saved.includes(y) && <span className="text-xs text-muted">· 남겨 둔 통계 있음</span>}
          </label>
        ))}
        <button
          type="button"
          disabled={loading || picked.length === 0}
          onClick={load}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? "계산하는 중…" : loaded ? "↻ 다시 계산하기" : "📈 통계 계산하기"}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {loaded && rows.length === 0 && <p className="text-sm text-muted">고른 학년도에 기록이 없어요.</p>}
      {loaded && rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <select value={subject} onChange={(e) => (setSubject(e.target.value), setCls(""))} aria-label="과목" className={inputClass}>
              <option value="">모든 과목</option>
              {opts.subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select value={pickedCls} onChange={(e) => setCls(e.target.value)} aria-label="반" className={inputClass}>
              <option value="">모든 반</option>
              {opts.classes.map((c) => (
                <option key={c} value={c}>
                  {c === "반 없음" ? c : `${c}반`}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              새 사이트 도입
              <select value={introAt ?? ""} onChange={(e) => setIntro(e.target.value || null)} aria-label="새 사이트 도입 시점" className={inputClass}>
                {!autoIntro && <option value="">없음</option>}
                {points.map((p) => (
                  <option key={p.month} value={p.month}>
                    {p.month}
                    {p.month === autoIntro && " (실행 기록이 처음 나온 달)"}
                  </option>
                ))}
              </select>
            </label>
            <span className="ml-auto flex flex-wrap gap-2 text-sm">
              {loaded.map((l) => (
                <a key={l.year} href={`/api/admin/year-stats?year=${l.year}`} className="rounded-lg border border-line px-3 py-2 hover:bg-page">
                  📥 {l.year}학년도 CSV
                </a>
              ))}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((m) => (
              <Compare key={m.key} metric={m} before={before} after={after} hasIntro={!!introAt} />
            ))}
          </div>
          <p className="text-sm text-muted">
            {introAt ? `${introAt}부터` : "고른 기간"}: 제출 {after.submissions.toLocaleString()}개 · AI 도우미 질문 {after.aiQuestions.toLocaleString()}번 · AI
            되돌아보기 {after.aiReviews.toLocaleString()}번 · 연습 문제 통과 {after.practiceSolved.toLocaleString()}개 · 학생이 만든 문제{" "}
            {after.studentProblems.toLocaleString()}개
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {METRICS.map((m) => (
              <LineChart key={m.key} metric={m} points={points} intro={introAt} hover={hover} onHover={setHover} />
            ))}
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer font-bold">📋 표로 보기 (월별)</summary>
            <MonthTable points={points} />
          </details>
          <p className="text-xs leading-5 text-muted">
            · 예전 사이트(v1) 기록에는 실행 기록이 없어, &lsquo;오류를 스스로 고쳐 다시 성공&rsquo;과 성찰 작성률은 새 사이트부터 보여요(실행 기록이 처음 나온 달을 도입 시점으로 짐작해요). · 학생 수는 반·과목별 수를
            더한 값이에요(두 과목을 듣는 학생은 두 번). · 붙여넣기는 감점이 아니라 과정의 한 모습이에요.
          </p>
        </>
      )}
    </section>
  );
}

/** 도입 전 → 뒤 한 칸 */
function Compare({ metric: m, before, after, hasIntro }: { metric: Metric; before: Period; after: Period; hasIntro: boolean }) {
  const a = after[m.key];
  const b = before[m.key];
  const diff = a !== null && b !== null ? Math.round((a - b) * 10) / 10 : null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line px-4 py-3" title={m.help}>
      <p className="text-sm text-muted">{m.title}</p>
      <p className="text-2xl font-bold tabular-nums">{fmt(a, m.unit)}</p>
      {hasIntro && (
        <p className="text-xs text-muted tabular-nums">
          도입 전 {!before.months ? "기록 없음" : b === null ? "없음 (새 사이트부터 기록)" : fmt(b, m.unit)}
          {diff !== null && ` → ${diff > 0 ? "+" : ""}${diff}${m.unit === "%" ? "%p" : m.unit}`}
        </p>
      )}
    </div>
  );
}

const W = 360;
const H = 170;
const PAD = { l: 36, r: 12, t: 14, b: 26 };

/** 지표 하나의 월별 선 그래프 (선 하나라 범례 없이 제목으로). 도입 달은 세로 점선 */
function LineChart({
  metric: m,
  points,
  intro,
  hover,
  onHover,
}: {
  metric: Metric;
  points: MonthPoint[];
  intro: string | null;
  hover: string | null;
  onHover: (m: string | null) => void;
}) {
  const vals = points.map((p) => p[m.key]);
  const top = m.max ?? Math.max(1, ...vals.map((v) => v ?? 0)) * 1.15;
  const step = points.length > 1 ? (W - PAD.l - PAD.r) / (points.length - 1) : 0;
  const x = (i: number) => (points.length > 1 ? PAD.l + i * step : (W + PAD.l - PAD.r) / 2);
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  // 값이 없는 달에서는 선을 끊는다
  const segments: string[] = [];
  let cur = "";
  vals.forEach((v, i) => {
    if (v === null) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  const ticks = [0, top / 2, top].map((t) => Math.round(t * 10) / 10);
  const every = Math.ceil(points.length / 8);
  const hi = points.findIndex((p) => p.month === hover);
  const introI = points.findIndex((p) => p.month === intro);

  return (
    <figure className="rounded-lg border border-line px-3 py-2">
      <figcaption className="flex items-baseline gap-2 text-sm">
        <b>{m.title}</b>
        <span className="text-xs text-muted">({m.unit})</span>
        <span className="ml-auto text-xs text-muted tabular-nums">{hi >= 0 ? `${points[hi].month}: ${fmt(vals[hi], m.unit)}` : m.help}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${m.title} 월별 변화`} onMouseLeave={() => onHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--color-muted)">
              {t}
            </text>
          </g>
        ))}
        {introI >= 0 && (
          <g>
            <line x1={x(introI)} x2={x(introI)} y1={PAD.t - 4} y2={H - PAD.b} stroke="var(--color-muted)" strokeDasharray="3 3" />
            <text x={x(introI) + 4} y={PAD.t + 4} fontSize={10} fill="var(--color-muted)">
              새 사이트
            </text>
          </g>
        )}
        {hi >= 0 && <line x1={x(hi)} x2={x(hi)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-ink)" strokeOpacity={0.25} />}
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--color-brand)" strokeWidth={2} strokeLinejoin="round" />
        ))}
        {points.map((p, i) => (
          <g key={p.month}>
            {vals[i] !== null && (
              <circle cx={x(i)} cy={y(vals[i]!)} r={hi === i ? 5 : 4} fill="var(--color-brand)" stroke="white" strokeWidth={2} />
            )}
            {i % every === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
                {monthLabel(p.month)}
              </text>
            )}
            {/* 마우스를 올릴 칸 (점보다 넓게) */}
            <rect
              x={x(i) - Math.max(step, 24) / 2}
              y={PAD.t}
              width={Math.max(step, 24)}
              height={H - PAD.t - PAD.b}
              fill="transparent"
              onMouseEnter={() => onHover(p.month)}
            />
          </g>
        ))}
      </svg>
    </figure>
  );
}

function MonthTable({ points }: { points: MonthPoint[] }) {
  const head = ["월", "제출", "제출한 학생", "직접 작성 %", "스스로 고침/제출", "성찰 작성률 %", "작업 시간(분)/제출", "AI 질문", "되돌아보기", "연습 통과"];
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-right tabular-nums">
        <thead>
          <tr className="border-b border-line text-muted">
            {head.map((h) => (
              <th key={h} className="px-2 py-1 font-normal first:text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.month} className="border-b border-line/60">
              <td className="px-2 py-1 text-left">{p.month}</td>
              <td className="px-2 py-1">{p.submissions}</td>
              <td className="px-2 py-1">{p.submitStudents}</td>
              <td className="px-2 py-1">{fmt(p.typedPct, "")}</td>
              <td className="px-2 py-1">{fmt(p.fixedPer, "")}</td>
              <td className="px-2 py-1">{fmt(p.reflectPct, "")}</td>
              <td className="px-2 py-1">{fmt(p.minutesPer, "")}</td>
              <td className="px-2 py-1">{p.aiQuestions}</td>
              <td className="px-2 py-1">{p.aiReviews}</td>
              <td className="px-2 py-1">{p.practiceSolved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
