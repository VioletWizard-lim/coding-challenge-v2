"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import ProblemView from "@/components/ProblemView";
import { compareNumber, openStatus, type Problem } from "@/lib/problemBank";
import { SUBJECTS } from "@/lib/problems";
import { standardLabel, standardOf, type StandardSummary } from "@/lib/standards";
import { loadStandardSummary, type ProblemResult } from "./actions";
import ProblemForm, { inputClass } from "./ProblemForm";
import ProblemImport from "./ProblemImport";
import CloseButton from "@/components/CloseButton";

/** 다음 번호 추천: 그 과목 마지막 번호의 다음 (예: 3-5 → 3-6) */
function nextNumber(list: Problem[]) {
  const last = list
    .map((p) => p.number)
    .sort(compareNumber)
    .pop();
  if (!last) return "1-1";
  const [u, n] = last.split("-").map(Number);
  return `${u}-${n + 1}`;
}

/** 차시순: 차시 → 차시 안 순서 → 번호 (차시를 안 정한 문제는 맨 뒤) */
function compareLesson(a: Problem, b: Problem) {
  const big = Number.MAX_SAFE_INTEGER;
  return (
    (a.lesson ?? big) - (b.lesson ?? big) ||
    (a.lessonOrder ?? big) - (b.lessonOrder ?? big) ||
    compareNumber(a.number, b.number)
  );
}

/** 문제 관리: 과목별 문제 목록, 새 문제·고치기·지우기, 공개 시각, 수업 계획(차시·성취기준) */
export default function ProblemManager({
  problems,
  tableReady,
  fieldsReady,
  lessonReady,
  now,
}: {
  problems: Problem[];
  tableReady: boolean;
  fieldsReady: boolean;
  lessonReady: boolean;
  now: string;
}) {
  const subjects = Object.keys(SUBJECTS);
  const [subject, setSubject] = useState(subjects[0]);
  const [editing, setEditing] = useState<Problem | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  /** 저장·삭제 결과를 어느 문제 줄 아래에 보여 줄지 (새 문제는 맨 위) */
  const [messageAt, setMessageAt] = useState<string | null>(null);
  const [message, setMessage] = useState<ProblemResult | null>(null);
  const [order, setOrder] = useState<"number" | "lesson">("number");
  const [showStandards, setShowStandards] = useState(false);
  const all = problems.filter((p) => p.subject === subject);
  const list = order === "lesson" ? [...all].sort(compareLesson) : all;
  const nowDate = new Date(now);

  /** 문제 줄 (미리보기·고치기를 열면 그 줄이 화면 위쪽에 오도록 옮길 때 씀) */
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  /** 방금 연 줄 번호: 펼친 내용이 화면 밖으로 나가면 그 줄이 화면 위쪽에 오게 옮긴다 */
  const scrollTo = useRef<string | null>(null);
  const setScrollTo = (n: string) => {
    scrollTo.current = n;
  };
  // 미리보기·고치기 칸이 열린 뒤(화면에 그려진 뒤)에 위치를 잰다
  useEffect(() => {
    const n = scrollTo.current;
    if (!n) return;
    scrollTo.current = null; // 한 번만 (이미 다 보여서 안 옮길 때도)
    const row = rowRefs.current.get(n);
    const opened = row?.nextElementSibling;
    if (!row || !opened) return;
    const header = 64; // 맨 위 고정 막대 높이 + 여유
    const top = row.getBoundingClientRect().top;
    const bottom = opened.getBoundingClientRect().bottom;
    // 줄과 펼친 내용이 이미 다 보이면 움직이지 않는다
    if (top >= header && bottom <= window.innerHeight) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: window.scrollY + top - header - 8, behavior: reduce ? "auto" : "smooth" });
  }, [viewing, editing]);

  /** 새 문제 입력 칸에 무언가 적었는지 (다시 누르면 닫을지 정할 때 씀) */
  const newDirty = useRef(false);
  const newOpen = editing?.id === null;

  function startNew() {
    setMessage(null);
    if (newOpen) {
      // 다시 누르면 닫는다. 적은 내용이 있으면 한 번 물어본다
      if (newDirty.current && !confirm("새 문제에 적은 내용이 있어요. 지우고 닫을까요?")) return;
      return setEditing(null);
    }
    newDirty.current = false;
    setEditing({
      id: null,
      subject,
      number: nextNumber(all),
      title: "",
      difficulty: null,
      description: "",
      conditions: "",
      examples: [],
      goal: "",
      challenge: "",
      starterCode: "",
      openAt: null,
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-bold">📚 문제 등록 및 관리</h2>
        <select
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setEditing(null);
          }}
          aria-label="과목"
          className={inputClass}
        >
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={startNew}
          disabled={!tableReady}
          className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          {newOpen ? "✕ 새 문제 닫기" : "＋ 새 문제"}
        </button>
      </div>

      {!tableReady && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 문제 등록 및 관리를 쓰려면 Supabase SQL Editor에서 <code>supabase/migrations/003_problems.sql</code>을 실행해
          주세요. 지금은 코드에 들어 있는 문제 목록을 보여 줘요(고칠 수 없음).
        </p>
      )}
      <ProblemImport problems={problems} now={now} disabled={!tableReady || !fieldsReady} />

      {tableReady && !fieldsReady && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 난이도·조건·예시·문제 목표·도전 과제를 저장하려면 Supabase SQL Editor에서{" "}
          <code>supabase/migrations/004_problem_fields.sql</code>을 실행해 주세요.
        </p>
      )}
      {tableReady && fieldsReady && !lessonReady && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 문제에 차시·성취기준·기본/심화·앵커를 저장하려면 Supabase SQL Editor에서{" "}
          <code>supabase/migrations/025_problem_lessons.sql</code>을 실행해 주세요.
        </p>
      )}
      <p className="text-sm text-muted">
        공개 시각이 되면 학생 화면에 문제가 나타나요. 그 전에는 학생에게 제목도 보이지 않아요. 시각은 한국 시간이에요. 문제 줄을 누르면 학생 화면에 보이는 모습을 볼 수 있어요.
      </p>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">순서</span>
        {(
          [
            ["number", "번호순"],
            ["lesson", "차시순"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={order === k}
            onClick={() => setOrder(k)}
            className={`rounded-lg border px-3 py-1 ${order === k ? "border-brand bg-brand-soft font-bold text-brand" : "border-line bg-white"}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-expanded={showStandards}
          onClick={() => setShowStandards(!showStandards)}
          className="ml-auto rounded-lg border border-line bg-white px-3 py-1"
        >
          {showStandards ? "▾" : "▸"} 성취기준별 보기
        </button>
      </div>
      {showStandards && <StandardPanel key={subject} subject={subject} onClose={() => setShowStandards(false)} />}

      {message && messageAt === null && <Notice result={message} />}

      {/* 새 문제는 맨 위에서, 이미 있는 문제는 그 줄 바로 아래에서 고친다 */}
      {editing && editing.id === null && (
        <ProblemForm
          key={`new-${editing.number}`}
          problem={editing}
          now={nowDate}
          siblings={problems}
          lessonReady={lessonReady}
          onDone={(r) => {
            setMessage(r);
            setMessageAt(null);
            if (r.ok) setEditing(null);
          }}
          onCancel={() => setEditing(null)}
          onDirtyChange={(dirty) => {
            newDirty.current = dirty;
          }}
        />
      )}

      <div className="scrollbar-none overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-normal">번호</th>
              <th className="py-2 pr-3 font-normal">제목</th>
              <th className="py-2 pr-3 font-normal">난이도</th>
              <th className="py-2 pr-3 font-normal">차시·성취기준</th>
              <th className="py-2 pr-3 font-normal">내용</th>
              <th className="py-2 pr-3 font-normal">공개</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const status = openStatus(p, nowDate);
              const isEditing = editing !== null && editing.id !== null && editing.id === p.id;
              const isViewing = viewing === p.number && !isEditing;
              return (
                <Fragment key={p.number}>
                  {/* 줄을 누르면 학생 화면 미리보기가 펼쳐진다 (고치는 중에는 고치기 칸이 대신 열려 있음) */}
                  <tr
                    ref={(el) => {
                      if (el) rowRefs.current.set(p.number, el);
                      else rowRefs.current.delete(p.number);
                    }}
                    onClick={() => {
                      if (isEditing) return;
                      setViewing(isViewing ? null : p.number);
                      if (!isViewing) setScrollTo(p.number);
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && !isEditing) {
                        e.preventDefault();
                        setViewing(isViewing ? null : p.number);
                        if (!isViewing) setScrollTo(p.number);
                      }
                    }}
                    tabIndex={isEditing ? undefined : 0}
                    aria-expanded={isEditing ? undefined : isViewing}
                    title={isEditing ? undefined : isViewing ? "누르면 접혀요" : "누르면 문제가 보여요"}
                    className={`border-b border-line/60 ${isEditing || isViewing ? "bg-brand-soft/50" : "cursor-pointer hover:bg-page"}`}
                  >
                    <td className="py-2 pr-3 font-mono whitespace-nowrap">
                      <span className="mr-1 inline-block w-3 text-muted" aria-hidden>
                        {isEditing ? "" : isViewing ? "▾" : "▸"}
                      </span>
                      {p.number}
                    </td>
                    <td className="py-2 pr-3">
                      {p.title === p.number ? <span className="text-muted">(제목 없음)</span> : p.title}
                    </td>
                    <td
                      className="py-2 pr-3 whitespace-nowrap text-amber-500"
                      aria-label={p.difficulty ? `별 ${p.difficulty}개` : "난이도 없음"}
                    >
                      {p.difficulty ? "★".repeat(p.difficulty) : <span className="text-muted">–</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      <LessonCell p={p} />
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">
                      {[
                        p.description && "문제",
                        p.conditions && "조건",
                        p.examples.length && `예시 ${p.examples.length}`,
                        p.goal && "목표",
                        p.challenge && "도전",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "–"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {status.kind === "open" && <span className="text-green-700">● {status.text}</span>}
                      {status.kind === "scheduled" && <span className="text-amber-700">◷ {status.text}</span>}
                      {status.kind === "hidden" && <span className="text-muted">○ {status.text}</span>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {tableReady && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation(); // 줄 누르기(문제 보기)와 겹치지 않게
                            setMessage(null);
                            setViewing(null);
                            setEditing(isEditing ? null : p);
                            if (!isEditing) setScrollTo(p.number);
                          }}
                          className="text-brand hover:underline"
                        >
                          {isEditing ? "닫기" : "고치기"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isViewing && (
                    <tr className="border-b border-line/60">
                      <td colSpan={7} className="bg-page/60 p-4">
                        <div className="max-w-xl rounded-xl border border-line bg-white p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-xs text-muted">학생 화면에서 이렇게 보여요</p>
                            <CloseButton onClick={() => setViewing(null)} />
                          </div>
                          <ProblemView problem={p} fit />
                        </div>
                      </td>
                    </tr>
                  )}
                  {isEditing && (
                    <tr>
                      <td colSpan={7} className="py-2">
                        <ProblemForm
                          key={p.id ?? p.number}
                          problem={editing}
                          now={nowDate}
                          siblings={problems}
                          lessonReady={lessonReady}
                          onDone={(r) => {
                            setMessage(r);
                            setMessageAt(p.number);
                            if (r.ok) setEditing(null);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  )}
                  {message && messageAt === p.number && !isEditing && (
                    <tr>
                      <td colSpan={7} className="pb-2">
                        <Notice result={message} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <p className="py-4 text-sm text-muted">이 과목에는 아직 문제가 없어요.</p>}
      </div>
    </section>
  );
}

/** 목록의 "차시·성취기준" 칸: "2차시 1번 · 기본 · ⚓앵커" + 성취기준 */
function LessonCell({ p }: { p: Problem }) {
  const head = [
    p.lesson ? `${p.lesson}차시${p.lessonOrder ? ` ${p.lessonOrder}번` : ""}` : "",
    p.level ?? "",
  ].filter(Boolean);
  const codes = p.standards ?? [];
  if (!head.length && !codes.length && !p.anchor) return <span className="text-muted">–</span>;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="whitespace-nowrap">
        {head.join(" · ")}
        {p.anchor && (
          <span className="ml-1 rounded bg-amber-100 px-1 font-bold text-amber-900" title="기준 문제(앵커): 차시의 마지막·가장 어려운 문제">
            ⚓ 앵커
          </span>
        )}
      </span>
      {codes.length > 0 && (
        <span className="text-muted" title={codes.map((c) => `${standardLabel(c)}: ${standardOf(c)?.text ?? ""}`).join("\n")}>
          {codes.map((c) => c.replace("12정", "")).join(" ")}
        </span>
      )}
    </div>
  );
}

/** 성취기준별 보기: 성취기준마다 문제 수·앵커·낸 학생 수·제출 수 */
function StandardPanel({ subject, onClose }: { subject: string; onClose: () => void }) {
  const [rows, setRows] = useState<StandardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadStandardSummary(subject).then((r) => {
      if (!alive) return;
      if (r.ok) setRows(r.rows);
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [subject]);
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!rows) return <p className="text-sm text-muted">불러오는 중…</p>;
  return (
    <div className="scrollbar-none overflow-x-auto rounded-lg border border-line bg-page/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-bold">성취기준별 보기</span>
        <CloseButton onClick={onClose} />
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-muted">
          <tr className="border-b border-line">
            <th className="py-1 pr-3 font-normal">성취기준</th>
            <th className="py-1 pr-3 font-normal">문제</th>
            <th className="py-1 pr-3 font-normal">앵커</th>
            <th className="py-1 pr-3 text-right font-normal">낸 학생</th>
            <th className="py-1 text-right font-normal">제출</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code || "none"} className="border-b border-line/60 align-top">
              <td className="py-1 pr-3" title={standardOf(r.code)?.text}>
                {r.code ? standardLabel(r.code) : <span className="text-muted">(성취기준 없음)</span>}
              </td>
              <td className="py-1 pr-3">
                {r.problems.length}개 <span className="text-xs text-muted">({r.problems.join(", ")})</span>
              </td>
              <td className="py-1 pr-3 text-xs">{r.anchors.join(", ") || <span className="text-muted">–</span>}</td>
              <td className="py-1 pr-3 text-right">{r.students}명</td>
              <td className="py-1 text-right">{r.submissions}건</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-2 text-sm text-muted">이 과목에는 아직 문제가 없어요.</p>}
      <p className="mt-2 text-xs text-muted">
        한 문제에 성취기준이 여러 개면 각 줄에 모두 세요. 통과율 같은 연구용 지표는 따로 내려받을 수 있게 할 예정이에요.
      </p>
    </div>
  );
}

function Notice({ result }: { result: ProblemResult }) {
  return (
    <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-green-700" : "text-danger"}`}>
      {result.message}
    </p>
  );
}
