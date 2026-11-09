"use client";

import { useEffect, useState, useTransition } from "react";
import { confirmPhrase, schoolYearOf } from "@/lib/yearEnd";
import { cleanYear, keepYearStats, loadYearEnd, type YearEndInfo } from "./actions";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" });

/**
 * 🗓 학년도 말 정리 (관리자). 순서: ① 백업 내려받기 → ② 이름 없는 통계 남기기 → ③ 지우기(확인 문구).
 * 지우는 것: AI 대화·되돌아보기·연습·학생이 만든 문제·성찰·메모·재생 기록·AI 채점 초안.
 * 남기는 것: 제출(코드·설명·작성 기록·점수·피드백)과 채점 기록, 계정, 문제, 설정.
 */
export default function YearEndPanel() {
  const current = schoolYearOf(new Date());
  const years = Array.from({ length: 5 }, (_, i) => current - i);
  // 기본: 이미 끝난 지난 학년도
  const [year, setYear] = useState(current - 1);
  const [info, setInfo] = useState<Extract<YearEndInfo, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    loadYearEnd(year).then((r) => {
      if (!alive) return;
      if (!r.ok) return setError(r.message);
      setError(null);
      setInfo(r);
    });
    return () => {
      alive = false;
    };
  }, [year, reload]);

  const saved = info?.savedYears.find((y) => y.year === year);
  const total = info?.counts.reduce((s, c) => s + (c.count ?? 0), 0) ?? 0;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">🗓 학년도 말 정리</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          안내 페이지에 적은 대로 학습 활동 기록은 <b>그 학년도가 끝나는 다음 해 2월 말까지</b> 보관해요. 3월 1일부터 지난 학년도 기록을 지울 수
          있어요. <b>제출(코드·설명·작성 기록·점수·피드백)과 채점 기록은 평가 기록이라 지우지 않아요.</b> 지우기 전에 백업과 이름 없는 통계를 꼭
          남겨 주세요.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        학년도
        <select
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
            setPhrase("");
            setMessage(null);
          }}
          className="rounded-lg border border-line bg-white px-3 py-2"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}학년도 ({y}.3 ~ {y + 1}.2){y === current ? " · 지금" : ""}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!info && !error && <p className="text-sm text-muted">불러오는 중…</p>}

      {info && (
        <>
          <div className="rounded-lg bg-page px-4 py-3 text-sm">
            <p className="font-bold">지울 기록 ({year}학년도)</p>
            <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
              {info.counts.map((c) => (
                <li key={c.table} className="flex justify-between gap-3">
                  <span>{c.label}</span>
                  <span className="tabular-nums text-muted">{c.count === null ? "표 없음" : `${c.count.toLocaleString()}건`}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">남는 것: 제출과 점수·피드백, 채점 기준, 학생·교사 계정, 문제, 설정</p>
          </div>

          <ol className="flex flex-col gap-3">
            <li className="flex flex-wrap items-center gap-3">
              <span className="font-bold">① 백업 내려받기</span>
              <a
                href={`/api/admin/year-backup?year=${year}`}
                download
                className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-page"
              >
                💾 {year}학년도 백업 (JSON)
              </a>
              <span className="text-xs text-muted">학교 규정에 맞게 보관하거나 폐기해 주세요. 이름이 들어 있어요.</span>
            </li>
            <li className="flex flex-wrap items-center gap-3">
              <span className="font-bold">② 이름 없는 통계 남기기</span>
              <button
                type="button"
                disabled={pending || !info.statsReady}
                onClick={() =>
                  startTransition(async () => {
                    setMessage(null);
                    const r = await keepYearStats(year);
                    setMessage(r.ok ? `통계를 남겼어요 (${r.rowCount}줄). 보고서·연구에 쓸 수 있어요.` : r.message);
                    setReload((n) => n + 1);
                  })
                }
                className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-page disabled:opacity-50"
              >
                📊 {saved ? "다시 계산해 남기기" : "통계 남기기"}
              </button>
              {saved && (
                <a href={`/api/admin/year-stats?year=${year}`} download className="text-sm font-bold text-brand hover:underline">
                  CSV 내려받기 ({dateFormat.format(new Date(saved.createdAt))}에 남김)
                </a>
              )}
              {!info.statsReady && <span className="text-xs text-amber-900">Supabase에서 019 SQL을 먼저 실행해 주세요.</span>}
            </li>
            <li className="flex flex-col gap-2">
              <span className="font-bold">③ 지우기</span>
              {!info.canClean ? (
                <p className="text-sm text-muted">
                  {year}학년도는 아직 보관 기간이에요. {year + 1}년 3월 1일부터 지울 수 있어요.
                </p>
              ) : !saved ? (
                <p className="text-sm text-muted">②에서 통계를 먼저 남겨 주세요.</p>
              ) : total === 0 ? (
                <p className="text-sm text-muted">지울 기록이 없어요.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    placeholder={`"${confirmPhrase(year)}"라고 적기`}
                    aria-label="확인 문구"
                    className="rounded-lg border border-line px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={pending || phrase.trim() !== confirmPhrase(year)}
                    onClick={() =>
                      startTransition(async () => {
                        setMessage(null);
                        const r = await cleanYear(year, phrase);
                        if (!r.ok) return setMessage(r.message);
                        const n = r.deleted.reduce((s, d) => s + (d.deleted ?? 0), 0);
                        setMessage(`${year}학년도 학습 활동 기록 ${n.toLocaleString()}건을 지웠어요. 제출과 점수는 그대로예요.`);
                        setPhrase("");
                        setReload((k) => k + 1);
                      })
                    }
                    className="rounded-lg bg-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    🗑 {year}학년도 기록 지우기
                  </button>
                </div>
              )}
            </li>
          </ol>
          {message && (
            <p role="status" className="rounded-lg bg-page px-3 py-2 text-sm">
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
