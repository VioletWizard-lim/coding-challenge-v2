"use client";

import { useEffect, useState, useTransition } from "react";
import { rowsFromCsv, type BackupSchema } from "@/lib/backupCsv";
import {
  classLabel,
  confirmPhrase,
  remapRow,
  schoolYearOf,
  YEAR_TABLES,
} from "@/lib/yearEnd";
import { readZip } from "@/lib/zip";
import {
  cleanYear,
  keepYearStats,
  loadYearEnd,
  restoreChunk,
  type YearEndInfo,
} from "./actions";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/**
 * 🗓 학년도 말 정리 (관리자). 순서: ① 전체 백업(ZIP, 표마다 CSV) → ② 이름 없는 통계 남기기 → ③ 지우기(확인 문구).
 * 지우는 것: 그 학년도 학생 기록 전부 (제출·점수·피드백, 학생 계정, AI 대화, 성찰, 메모, 연습, 학생이 만든 문제).
 * 남는 것: 교사·관리자 계정, 수업 문제, 채점 기준, 설정, 이름 없는 통계. 백업 ZIP으로 되돌릴 수 있다.
 */
export default function YearEndPanel() {
  const current = schoolYearOf(new Date());
  const years = Array.from({ length: 5 }, (_, i) => current - i);
  // 기본: 이미 끝난 지난 학년도
  const [year, setYear] = useState(current - 1);
  const [info, setInfo] = useState<Extract<YearEndInfo, { ok: true }> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [allStudents, setAllStudents] = useState(false);
  /** 반 고르기: 빈 값이면 모든 반 ("class:2-3", "prog:2-5") */
  const [cls, setCls] = useState("");
  /** 지금 보이는 수가 어느 범위의 것인지 (반·학년도를 바꾸면 새 수를 받을 때까지 숨김) */
  const [shown, setShown] = useState("");
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    loadYearEnd(year, cls).then((r) => {
      if (!alive) return;
      if (!r.ok) return setError(r.message);
      setError(null);
      setInfo(r);
      setShown(`${year}|${cls}`);
    });
    return () => {
      alive = false;
    };
  }, [year, cls, reload]);

  const saved = info?.savedYears.find((y) => y.year === year);
  const studentCount = info
    ? allStudents
      ? info.students.all
      : info.students.withRecords
    : 0;
  const total =
    (info?.counts.reduce((s, c) => s + (c.count ?? 0), 0) ?? 0) + studentCount;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">🗓 학년도 말 정리</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          학생 기록은 <b>그 학년도가 끝나는 다음 해 2월 말까지</b> 보관하고, 3월
          1일부터 지난 학년도 <b>학생 기록을 모두</b> 지워요(제출·점수·피드백,
          학생 계정, AI 대화, 성찰, 메모, 연습 문제, 학생이 만든 문제). 지우기
          전에 <b>전체 백업</b>을 받고 <b>이름 없는 통계</b>를 남겨 주세요. 백업
          파일로 되돌릴 수 있어요. 2월 중에 학생들에게 &lsquo;💭 오늘의 성찰 →
          내 성찰 모두 내려받기&rsquo;를 안내해 주세요.
        </p>
        <p className="mt-1 text-xs text-amber-900">
          제출과 학생 계정은 예전 수업 사이트와 함께 쓰는 표예요. 예전 사이트를
          더 쓰지 않을 때(3월 전환 뒤)에 지워 주세요.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
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
        <label className="flex items-center gap-2 text-sm">
          반
          <select
            value={cls}
            onChange={(e) => {
              setCls(e.target.value);
              setPhrase("");
              setMessage(null);
            }}
            className="rounded-lg border border-line bg-white px-3 py-2"
          >
            <option value="">모든 반</option>
            {info?.classes.plain.map((c) => (
              <option key={`class:${c}`} value={`class:${c}`}>
                {c}반
              </option>
            ))}
            {info?.classes.prog.map((c) => (
              <option key={`prog:${c}`} value={`prog:${c}`}>
                프로그래밍 {c}반
              </option>
            ))}
          </select>
        </label>
      </div>
      {cls && (
        <p className="-mt-2 text-xs text-muted">
          {classLabel(cls)} 학생(지금 계정의 반 기준)의 기록만 백업·삭제해요.
          예전 사이트 제출은 이름과 제출할 때의 반이 맞는 것만 들어가요.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {!info && !error && <p className="text-sm text-muted">불러오는 중…</p>}

      {info && shown !== `${year}|${cls}` && <p className="text-sm text-muted">불러오는 중…</p>}
      {info && shown === `${year}|${cls}` && (
        <>
          <div className="rounded-lg bg-page px-4 py-3 text-sm">
            <p className="font-bold">
              지울 기록 ({year}학년도{cls ? ` · ${classLabel(cls)}` : ""})
            </p>
            <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
              {info.counts.map((c) => (
                <li key={c.table} className="flex justify-between gap-3">
                  <span>{c.label}</span>
                  <span className="tabular-nums text-muted">
                    {c.count === null
                      ? "표 없음"
                      : `${c.count.toLocaleString()}건`}
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-3">
                <span>학생 계정</span>
                <span className="tabular-nums text-muted">
                  {studentCount.toLocaleString()}명
                </span>
              </li>
            </ul>
            <label className="mt-2 flex items-start gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={allStudents}
                onChange={(e) => setAllStudents(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <b>{cls ? `${classLabel(cls)}의 ` : ""}모든 학생 계정</b> 지우기
                ({info.students.all.toLocaleString()}명). 꺼 두면 {year}학년도에
                기록이 있고 그 뒤 기록이 없는 학생(
                {info.students.withRecords.toLocaleString()}명)만 지워요.{" "}
                <b>새 학년 학생을 이미 등록했다면 켜지 마세요.</b>
              </span>
            </label>
            <p className="mt-2 text-xs text-muted">
              남는 것: 교사·관리자 계정, 수업 문제, 채점 기준, 설정, 이름 없는
              통계
            </p>
          </div>

          <ol className="flex flex-col gap-3">
            <li className="flex flex-wrap items-center gap-3">
              <span className="font-bold">① 전체 백업</span>
              <a
                href={`/api/admin/year-backup?${new URLSearchParams({ year: String(year), ...(cls ? { cls } : {}) })}`}
                download
                className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-page"
              >
                💾 {year}학년도{cls ? ` ${classLabel(cls)}` : ""} 백업 (ZIP ·
                표마다 CSV)
              </a>
              <span className="text-xs text-muted">
                엑셀로 열어 볼 수 있어요. 되돌리려면 받은 ZIP을 고치지 말고
                그대로 보관해 주세요. 이름이 들어 있어요.
              </span>
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
                    setMessage(
                      r.ok
                        ? `통계를 남겼어요 (${r.rowCount}줄). 보고서·연구에 쓸 수 있어요.`
                        : r.message,
                    );
                    setReload((n) => n + 1);
                  })
                }
                className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-page disabled:opacity-50"
              >
                📊 {saved ? "다시 계산해 남기기" : "통계 남기기"}
              </button>
              {saved && (
                <a
                  href={`/api/admin/year-stats?year=${year}`}
                  download
                  className="text-sm font-bold text-brand hover:underline"
                >
                  CSV 내려받기 ({dateFormat.format(new Date(saved.createdAt))}에
                  남김)
                </a>
              )}
              {!info.statsReady && (
                <span className="text-xs text-amber-900">
                  Supabase에서 019 SQL을 먼저 실행해 주세요.
                </span>
              )}
            </li>
            <li className="flex flex-col gap-2">
              <span className="font-bold">③ 지우기</span>
              {!info.canClean ? (
                <p className="text-sm text-muted">
                  {year}학년도는 아직 보관 기간이에요. {year + 1}년 3월 1일부터
                  지울 수 있어요.
                </p>
              ) : !saved ? (
                <p className="text-sm text-muted">
                  ②에서 통계를 먼저 남겨 주세요.
                </p>
              ) : total === 0 ? (
                <p className="text-sm text-muted">지울 기록이 없어요.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    placeholder={`"${confirmPhrase(year, cls)}"라고 적기`}
                    aria-label="확인 문구"
                    className="rounded-lg border border-line px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={
                      pending || phrase.trim() !== confirmPhrase(year, cls)
                    }
                    onClick={() =>
                      startTransition(async () => {
                        setMessage(null);
                        const r = await cleanYear(
                          year,
                          phrase,
                          allStudents,
                          cls,
                        );
                        if (!r.ok) return setMessage(r.message);
                        const n = r.deleted.reduce(
                          (s, d) => s + (d.deleted ?? 0),
                          0,
                        );
                        setMessage(
                          `${year}학년도${cls ? ` ${classLabel(cls)}` : ""} 학생 기록 ${n.toLocaleString()}건을 지웠어요. 백업 ZIP으로 되돌릴 수 있어요.`,
                        );
                        setPhrase("");
                        setReload((k) => k + 1);
                      })
                    }
                    className="rounded-lg bg-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    🗑 {year}학년도{cls ? ` ${classLabel(cls)}` : ""} 학생 기록
                    지우기
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

      <Restore onDone={() => setReload((k) => k + 1)} />
    </section>
  );
}

type Loaded = {
  year: number | null;
  cls: string;
  tables: { table: string; label: string; rows: Record<string, unknown>[] }[];
};

/** 한 번에 보내는 양 (서버 액션 한도 4MB보다 작게) */
const MAX_BYTES = 2_000_000;
const MAX_ROWS = 200;

/** ↩ 백업에서 되돌리기: 브라우저가 ZIP을 읽어 표 순서대로 조금씩 보낸다. 이미 있는 기록은 건너뛴다 */
function Restore({ onDone }: { onDone: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function open(file: File) {
    setError(null);
    setProgress(null);
    setLoaded(null);
    try {
      const files = readZip(await file.arrayBuffer());
      const schemaFile = files.get("schema.json");
      if (!schemaFile)
        throw new Error(
          "이 사이트에서 받은 백업 ZIP이 아니에요 (schema.json이 없어요).",
        );
      const schema = JSON.parse(new TextDecoder().decode(schemaFile)) as {
        schoolYear?: number;
        cls?: string;
        tables: BackupSchema;
      };
      const tables = YEAR_TABLES.map((spec) => {
        const f = files.get(`${spec.table}.csv`);
        return {
          table: spec.table,
          label: spec.label,
          rows: f
            ? rowsFromCsv(
                new TextDecoder().decode(f),
                schema.tables[spec.table] ?? {},
              )
            : [],
        };
      });
      setLoaded({
        year: schema.schoolYear ?? null,
        cls: schema.cls ?? "",
        tables,
      });
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
  }

  async function run() {
    if (!loaded) return;
    if (
      !confirm(
        "백업 내용을 사이트에 다시 넣을까요? 이미 있는 기록은 건너뛰어요.",
      )
    )
      return;
    setRunning(true);
    setError(null);
    const maps: Record<string, Map<string, number>> = {};
    let inserted = 0;
    let skipped = 0;
    try {
      for (const t of loaded.tables) {
        const spec = YEAR_TABLES.find((s) => s.table === t.table)!;
        const map = (maps[t.table] = new Map<string, number>());
        const items = t.rows.flatMap((row) => {
          const mapped = remapRow(spec, row, maps);
          return mapped
            ? [
                {
                  row: mapped,
                  old: spec.id ? String(row.id) : null,
                  size: JSON.stringify(mapped).length,
                },
              ]
            : [];
        });
        for (let i = 0; i < items.length; ) {
          let size = 0;
          let j = i;
          while (
            j < items.length &&
            j - i < MAX_ROWS &&
            (j === i || size + items[j].size < MAX_BYTES)
          ) {
            size += items[j].size;
            j++;
          }
          const part = items.slice(i, j);
          setProgress(
            `${t.label}: ${j.toLocaleString()} / ${items.length.toLocaleString()}`,
          );
          const r = await restoreChunk(
            t.table,
            part.map((p) => p.row),
            part.map((p) => p.old),
          );
          if (!r.ok) throw new Error(`${t.label}: ${r.message}`);
          for (const [oldId, newId] of r.ids) map.set(oldId, newId);
          inserted += r.inserted;
          skipped += r.skipped;
          i = j;
        }
      }
      setProgress(
        `✅ 되돌렸어요. 새로 넣은 기록 ${inserted.toLocaleString()}건, 이미 있어서 건너뛴 기록 ${skipped.toLocaleString()}건.`,
      );
      onDone();
    } catch (err) {
      setError(
        `${String((err as Error)?.message ?? err)} — 다시 누르면 이어서 넣어요 (이미 들어간 것은 건너뜀).`,
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="font-bold">↩ 백업에서 되돌리기</h3>
      <p className="text-sm text-muted">
        ①에서 받은 ZIP(모든 반 또는 한 반)을 올리면 그 기록을 다시 넣어요. 이미
        있는 기록은 건너뛰어서 두 번 올려도 겹치지 않아요. 되살린 학생 계정은
        예전 사이트 비밀번호가 없으니, 로그인이 안 되면 비밀번호를 초기화해
        주세요.
      </p>
      <input
        type="file"
        accept=".zip,application/zip"
        aria-label="백업 ZIP 고르기"
        onChange={(e) => e.target.files?.[0] && open(e.target.files[0])}
        className="text-sm"
      />
      {loaded && (
        <div className="rounded-lg bg-page px-4 py-3 text-sm">
          <p className="font-bold">
            {loaded.year
              ? `${loaded.year}학년도${loaded.cls ? ` ${classLabel(loaded.cls)}` : ""} 백업`
              : "백업"}{" "}
            내용
          </p>
          <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
            {loaded.tables.map((t) => (
              <li key={t.table} className="flex justify-between gap-3">
                <span>{t.label}</span>
                <span className="tabular-nums text-muted">
                  {t.rows.length.toLocaleString()}건
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={running}
            onClick={run}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {running ? "되돌리는 중…" : "↩ 이 백업으로 되돌리기"}
          </button>
        </div>
      )}
      {progress && (
        <p role="status" className="text-sm">
          {progress}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
