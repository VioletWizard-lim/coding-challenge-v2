"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { byNumber } from "@/lib/classes";
import { scoreTable, writingTable, type StatRow, type WritingMetric } from "@/lib/classStats";
import { loadClassStats } from "./actions";

const inputClass = "rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

type View = "score" | WritingMetric;
const VIEWS: [View, string][] = [
  ["score", "점수"],
  ["paste", "붙여넣기 비율"],
  ["active", "실제 작업 시간"],
];

/** 📊 반별 현황 (v1 "반별 현황"·"작성 통계"·CSV 내보내기): 과목·연도·반을 고르면 학생별 표 */
export default function ClassStats({ subjects }: { subjects: string[] }) {
  const [subject, setSubject] = useState(subjects[0]);
  const [year, setYear] = useState<number | undefined>(undefined);
  const [cls, setCls] = useState("");
  const [view, setView] = useState<View>("score");
  const [anon, setAnon] = useState(false);
  const [data, setData] = useState<{ years: number[]; year: number; rows: StatRow[]; problemOrder: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const r = await loadClassStats(subject, year);
      if (!r.ok) return setError(r.message);
      setError(null);
      setData(r);
    });
  }, [subject, year]);

  const classes = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.cls).filter(Boolean))].sort(byNumber), [data]);
  const picked = classes.includes(cls) ? cls : "";
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !picked || r.cls === picked), [data, picked]);
  const scores = useMemo(() => scoreTable(rows, data?.problemOrder ?? []), [rows, data]);
  const writing = useMemo(() => (view === "score" ? null : writingTable(rows, view)), [rows, view]);
  const showClass = !picked;

  const exportUrl = (kind: "summary" | "raw") =>
    `/api/teacher/export?${new URLSearchParams({
      subject,
      year: String(data?.year ?? ""),
      cls: picked,
      anon: anon ? "1" : "0",
      kind,
    })}`;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-end gap-2">
        <h2 className="mr-auto text-lg font-bold">📊 반별 현황</h2>
        <select value={subject} onChange={(e) => (setSubject(e.target.value), setYear(undefined), setCls(""))} aria-label="과목" className={inputClass}>
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={data?.year ?? ""} onChange={(e) => setYear(Number(e.target.value))} aria-label="연도" className={inputClass}>
          {(data?.years ?? []).map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <select value={picked} onChange={(e) => setCls(e.target.value)} aria-label="반" className={inputClass}>
          <option value="">모든 반</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}반
            </option>
          ))}
        </select>
      </div>

      <div role="tablist" aria-label="보기" className="flex flex-wrap gap-1">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`rounded-lg px-3 py-1.5 text-sm ${view === v ? "bg-brand font-bold text-white" : "border border-line hover:bg-page"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {pending && <p className="text-sm text-muted">불러오는 중… (작성 기록을 요약하느라 조금 걸릴 수 있어요)</p>}

      {data && view === "score" && (
        <>
          <p className="text-xs leading-5 text-muted">
            문제마다 채점됐거나 오답 처리된 <b>가장 최근 제출</b>의 점수예요(오답은 0). 반은 제출할 때의 반이에요. <b>0점</b> = 표의 문제{" "}
            {scores.problems.length}개 중 0이거나 빈 칸(미제출·채점 전·0점·오답) 수.
          </p>
          {scores.rows.length ? (
            <Table
              head={["학생", ...(showClass ? ["반"] : []), "0점", "합계", ...scores.problems]}
              rows={scores.rows.map((r) => [
                label(r),
                ...(showClass ? [r.cls] : []),
                r.zeros,
                <b key="t">{r.total}</b>,
                ...scores.problems.map((p) => (r.scores[p] === null ? <span key={p} className="text-muted">-</span> : r.scores[p])),
              ])}
            />
          ) : (
            <p className="text-sm text-muted">이 조건의 채점된 제출이 없어요.</p>
          )}
        </>
      )}

      {data && writing && (
        <>
          <p className="text-xs leading-5 text-muted">
            열은 단원(대번호)별 합산, &lsquo;전체&rsquo;는 모든 문제 합산이에요. 문제마다 가장 최근 제출의 기록만 써요.{" "}
            {view === "paste"
              ? "붙여넣기 비율 = 붙여넣은 글자 수 ÷ (직접 입력 + 붙여넣기). 50% 이상은 노란색이에요 (감점이 아니라 함께 살펴볼 만한 값)."
              : "실제 작업 시간 = 30초 넘게 멈춘 구간을 뺀 시간(분)."}{" "}
            집계한 제출 {writing.count}건 · 작성 기록이 없는 예전 제출은 빠져요.
          </p>
          {writing.rows.length ? (
            <Table
              head={["학생", ...(showClass ? ["반"] : []), ...writing.units.map((u) => (u === "전체" ? u : `${u}번`))]}
              rows={writing.rows.map((r) => [
                label(r),
                ...(showClass ? [r.cls] : []),
                ...writing.units.map((u) => {
                  const v = r.values[u];
                  if (v === null) return <span key={u} className="text-muted">-</span>;
                  if (view === "active") return v.toFixed(1);
                  return (
                    <span key={u} className={v >= 50 ? "rounded bg-amber-100 px-1 font-bold text-amber-900" : ""}>
                      {v}%
                    </span>
                  );
                }),
              ])}
            />
          ) : (
            <p className="text-sm text-muted">이 조건의 작성 기록이 없어요.</p>
          )}
        </>
      )}

      {data && (
        <div className="flex flex-col gap-2 rounded-lg bg-page p-3 text-sm">
          <p className="font-bold">📥 기록 데이터 CSV 내보내기</p>
          <p className="text-xs text-muted">
            지금 고른 {subject} · {data.year}년 · {picked ? `${picked}반` : "모든 반"}의 제출(다시 낸 것 포함 전체)이에요. 엑셀에서 수식이 실행되지 않게 =, +,
            -, @로 시작하는 글 앞에는 &apos;를 붙여요.
          </p>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
            이름·아이디 대신 익명 ID(S001…)로 내보내기 (연구용)
          </label>
          <div className="flex flex-wrap gap-2">
            <a href={exportUrl("summary")} className="rounded-lg bg-brand px-3 py-1.5 font-bold text-white hover:opacity-90">
              ⬇️ 제출물별 요약 CSV
            </a>
            <a href={exportUrl("raw")} className="rounded-lg border border-brand bg-white px-3 py-1.5 font-bold text-brand hover:bg-brand-soft">
              📦 이벤트 원본 로그 CSV (용량이 커요)
            </a>
          </div>
        </div>
      )}
    </section>
  );
}

const label = (r: { studentId: string; name: string }) => (r.studentId && r.studentId !== r.name ? `${r.studentId} ${r.name}` : r.name);

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-line">
      <table className="w-full text-sm tabular-nums">
        <thead className="sticky top-0 bg-page text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`whitespace-nowrap px-2 py-1.5 font-normal ${i === 0 ? "sticky left-0 bg-page text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, k) => (
            <tr key={k} className="border-t border-line/60 hover:bg-page">
              {r.map((c, i) => (
                <td key={i} className={`whitespace-nowrap px-2 py-1 ${i === 0 ? "sticky left-0 bg-white text-left font-medium" : "text-right"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
