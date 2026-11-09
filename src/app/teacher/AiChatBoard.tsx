"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import AiAnswer from "@/components/AiAnswer";
import Replayer from "@/components/Replayer";
import { useStudentNav } from "@/components/SideTabs";
import type { AiChat } from "@/lib/aiChat";
import type { AiReview } from "@/lib/aiReview";
import { levelLabel, type PracticeForTeacher } from "@/lib/practice";
import type { Moment } from "@/lib/process-summary";
import ReplaySection from "../student/ReplaySection";

type Common = Pick<AiChat, "id" | "userId" | "subject" | "problem" | "createdAt" | "flaggedBy">;
/** 목록 한 줄: AI 도우미 대화 또는 AI 되돌아보기 */
type Item = Common & { key: string } & (
    | { type: "chat"; chat: AiChat }
    | { type: "review"; review: AiReview }
    | { type: "practice"; practice: PracticeForTeacher }
  );
const pick = (x: Common): Common => ({
  id: x.id,
  userId: x.userId,
  subject: x.subject,
  problem: x.problem,
  createdAt: x.createdAt,
  flaggedBy: x.flaggedBy,
});
import { classOptions, inClass } from "@/lib/classes";
import type { StudentRow } from "@/lib/teacher";
import { findChatReplay, flagAiChat, flagAiReview, flagPractice, loadAiChats, loadStudentReplay, type ChatReplay } from "./actions";

const inputClass = "rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * 교사용 학생 AI 대화 열람 (미성년자 보호 규칙). 반·학생·기간으로 고르고,
 * 부적절한 대화는 🚩로 표시해 둔다. 학생이 "이상한 답 알리기"를 누른 대화도 여기서 보인다.
 */
export default function AiChatBoard({ students }: { students: StudentRow[] }) {
  const { problemLabel } = useStudentNav();
  const [days, setDays] = useState(7);
  const [picked, setPicked] = useState("");
  const [studentId, setStudentId] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [data, setData] = useState<{ ready: boolean; chats: AiChat[]; reviews: AiReview[]; practice: PracticeForTeacher[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);
  /** 순간 버튼을 눌러 연 재생 (목록 한 줄에 하나) */
  const [opened, setOpened] = useState<{ key: string; at: number; label: string } | null>(null);
  const openMoment = (key: string) => (m: Moment) => setOpened({ key, at: m.at, label: m.label });

  useEffect(() => {
    startTransition(async () => {
      const r = await loadAiChats(days);
      if (!r.ok) return setError(r.message);
      setError(null);
      setData({ ready: r.ready, chats: r.chats, reviews: r.reviews, practice: r.practice });
    });
  }, [days, reload]);

  const byId = useMemo(() => new Map(students.map((s) => [String(s.id), s])), [students]);
  const options = useMemo(() => classOptions(students), [students]);
  const inPicked = useMemo(() => students.filter((s) => inClass(s, picked)), [students, picked]);
  const ids = new Set(inPicked.map((s) => String(s.id)));
  // 도우미 대화와 되돌아보기를 함께, 최근 것부터
  const all: Item[] = [
    ...(data?.chats ?? []).map((c) => ({ type: "chat" as const, key: `c${c.id}`, ...pick(c), chat: c })),
    ...(data?.reviews ?? []).map((r) => ({ type: "review" as const, key: `r${r.id}`, ...pick(r), review: r })),
    ...(data?.practice ?? []).map((p) => ({ type: "practice" as const, key: `p${p.id}`, ...pick({ ...p, problem: "" }), practice: p })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const chats = all.filter(
    (c) => (!picked || ids.has(c.userId)) && (!studentId || c.userId === studentId) && (!flaggedOnly || c.flaggedBy),
  );
  const flaggedCount = all.filter((c) => c.flaggedBy).length;

  function toggleFlag(item: Item) {
    const next = !item.flaggedBy;
    const flagged = next ? ("teacher" as const) : null;
    const save = item.type === "chat" ? flagAiChat : item.type === "review" ? flagAiReview : flagPractice;
    save(item.id, next).then((r) => {
      if (!r.ok) return setError(r.message ?? "저장하지 못했어요.");
      setData(
        (d) =>
          d && {
            ...d,
            chats: item.type === "chat" ? d.chats.map((x) => (x.id === item.id ? { ...x, flaggedBy: flagged } : x)) : d.chats,
            reviews: item.type === "review" ? d.reviews.map((x) => (x.id === item.id ? { ...x, flaggedBy: flagged } : x)) : d.reviews,
            practice: item.type === "practice" ? d.practice.map((x) => (x.id === item.id ? { ...x, flaggedBy: flagged } : x)) : d.practice,
          },
      );
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-lg font-bold">🤖 학생 AI 대화</h2>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="기간" className={inputClass}>
          <option value={7}>최근 7일</option>
          <option value={30}>최근 30일</option>
          <option value={180}>최근 6개월</option>
        </select>
        <select
          value={picked}
          onChange={(e) => {
            setPicked(e.target.value);
            setStudentId("");
          }}
          aria-label="반"
          className={inputClass}
        >
          <option value="">모든 반</option>
          {options.plain.map((c) => (
            <option key={`class:${c}`} value={`class:${c}`}>
              {c}반
            </option>
          ))}
          {options.prog.map((c) => (
            <option key={`prog:${c}`} value={`prog:${c}`}>
              프로그래밍 {c}반
            </option>
          ))}
        </select>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="학생" className={inputClass}>
          <option value="">모든 학생</option>
          {inPicked.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.id} {s.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          🚩 표시된 대화만 ({flaggedCount})
        </label>
        <button
          type="button"
          onClick={() => setReload((n) => n + 1)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-muted hover:bg-page"
        >
          ↻ 새로 불러오기
        </button>
      </div>
      <p className="text-xs leading-5 text-muted">
        학생은 AI 도우미 창에 &ldquo;대화는 선생님도 볼 수 있어요&rdquo;라는 안내를 봐요. 부적절한 대화는 🚩로 표시해 두세요.
        학생이 &lsquo;이상한 답 알리기&rsquo;를 누른 대화도 🚩로 보여요. 파란 순간 버튼(⏪)을 누르면 그 순간의 작성 과정 재생이 열려요.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
      {data && !data.ready && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ AI 도우미를 쓰려면 Supabase SQL Editor에서 <code>supabase/migrations/010_ai_chats.sql</code>을 실행해 주세요.
          실행 전에는 학생 화면에 &lsquo;선생님이 준비하고 있어요&rsquo;라고 나와요.
        </p>
      )}
      {data?.ready && (
        <p className="text-sm text-muted">{pending ? "불러오는 중…" : `${chats.length}개 (도우미 대화·되돌아보기·연습 문제)`}</p>
      )}
      <ul className={`flex flex-col gap-3 ${pending ? "opacity-50" : ""}`}>
        {chats.map((c) => {
          const s = byId.get(c.userId);
          return (
            <li
              key={c.key}
              className={`flex flex-col gap-2 rounded-lg border px-4 py-3 ${c.flaggedBy ? "border-rose-300 bg-rose-50/40" : "border-line"}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-bold">
                  {c.userId}
                  {s?.name && s.name !== c.userId && ` ${s.name}`}
                </span>
                <span className="text-muted">
                  {c.subject} {c.type === "practice" ? `연습 · ${c.practice.title}` : problemLabel(c.subject, c.problem)}
                </span>
                <span className="text-muted tabular-nums">{timeFormat.format(new Date(c.createdAt))}</span>
                {c.type === "review" && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">🔁 되돌아보기</span>
                )}
                {c.type === "practice" && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">🧪 연습 문제</span>
                )}
                {c.flaggedBy && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                    🚩 {c.flaggedBy === "student" ? "학생이 알림" : "교사 표시"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleFlag(c)}
                  className="ml-auto rounded-lg border border-line px-2 py-1 text-xs hover:bg-page"
                >
                  {c.flaggedBy ? "표시 풀기" : "🚩 부적절한 내용으로 표시"}
                </button>
              </div>
              {c.type === "practice" ? (
                <PracticeItem p={c.practice} />
              ) : c.type === "chat" ? (
                <>
                  <p className="whitespace-pre-wrap rounded-lg bg-brand-soft px-3 py-2 text-sm">
                    <b>질문</b> {c.chat.question}
                  </p>
                  <p className="whitespace-pre-wrap rounded-lg bg-page px-3 py-2 text-sm leading-6">
                    <b className="text-blue-700">🤖 AI 답</b> <AiAnswer chat={c.chat} onMoment={openMoment(c.key)} />
                  </p>
                  {opened?.key === c.key && <ChatReplayPanel chatId={c.chat.id} at={opened.at} label={opened.label} onClose={() => setOpened(null)} />}
                </>
              ) : (
                <div className="flex flex-col gap-1.5 text-sm">
                  {c.review.intro && (
                    <p className="rounded-lg bg-page px-3 py-2 leading-6">
                      <b className="text-blue-700">🤖 AI</b> <AiAnswer chat={{ answer: c.review.intro, moments: [] }} />
                    </p>
                  )}
                  {c.review.questions.map((q, i) => (
                    <div key={i} className="grid gap-1 rounded-lg border border-line px-3 py-2">
                      <p className="leading-6">
                        <b className="text-violet-700">질문 {i + 1}</b>
                        {q.moment && (
                          <MomentButton moment={q.moment} onClick={openMoment(c.key)} />
                        )}{" "}
                        <AiAnswer chat={{ answer: q.question, moments: [] }} />
                      </p>
                      <p className="whitespace-pre-wrap rounded bg-brand-soft px-2 py-1">
                        <b>학생 답</b> {q.answer || <span className="text-muted">(아직 안 씀)</span>}
                      </p>
                    </div>
                  ))}
                  {opened?.key === c.key && (
                    <ReplayFrame label={opened.label} onClose={() => setOpened(null)}>
                      <ReplaySection key={opened.at} submissionId={c.review.submissionId} loader={loadStudentReplay} startAt={opened.at} noteRole="teacher" autoStart />
                    </ReplayFrame>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {data?.ready && !pending && chats.length === 0 && <p className="text-sm text-muted">이 조건의 AI 대화가 없어요.</p>}
    </section>
  );
}

/** 학생이 받은 연습 문제: 근거(막힌 곳), 문제, 테스트, 참고 답안(교사만), 푼 결과 */
function PracticeItem({ p }: { p: PracticeForTeacher }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="text-muted">
        {p.source === "stuck" ? `🧩 막힌 곳에서: ${p.basis}` : `📚 개념: ${p.concept}`} · {levelLabel(p.level)} ·{" "}
        {p.solvedAt ? "✅ 통과" : p.passed !== null ? `${p.passed}/${p.tests.length} 통과 (확인 ${p.checks}번)` : "아직 안 풀어 봄"}
      </p>
      <div className="rounded-lg bg-page px-3 py-2 leading-6">
        <p>
          <b className="text-blue-700">🤖 AI</b> <b>{p.title}</b>
        </p>
        <p className="whitespace-pre-wrap">{p.description}</p>
        {p.conditions.length > 0 && (
          <ol className="list-decimal pl-5">
            {p.conditions.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-muted">테스트 {p.tests.length}개 · 참고 답안 (학생에게는 안 보임){p.code !== null && " · 학생 코드"}</summary>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {p.tests.map((t, i) => (
            <pre key={i} className="whitespace-pre-wrap rounded border border-line px-2 py-1 font-mono text-xs">
              {t.inputs.length ? `입력: ${t.inputs.join(" / ")}\n` : ""}
              {t.output}
            </pre>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">참고 답안 (서버에서 실행해 모든 테스트 통과를 확인함)</p>
        <pre className="whitespace-pre-wrap rounded bg-page px-2 py-1 font-mono text-xs">{p.solution}</pre>
        {p.code !== null && (
          <>
            <p className="mt-2 text-xs text-muted">학생의 마지막 확인 때 코드</p>
            <pre className="whitespace-pre-wrap rounded bg-brand-soft px-2 py-1 font-mono text-xs">{p.code}</pre>
          </>
        )}
      </details>
    </div>
  );
}

function MomentButton({ moment, onClick }: { moment: Moment; onClick: (m: Moment) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(moment)}
      title="눌러서 이 순간의 재생 보기"
      className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 align-baseline text-sm font-medium text-blue-800 hover:bg-blue-100"
    >
      ⏪ {moment.label}
    </button>
  );
}

/** 순간 버튼으로 연 재생을 감싸는 틀 (어느 순간인지, 닫기) */
function ReplayFrame({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50/30 p-3">
      <div className="flex items-center gap-2 text-sm">
        <b className="text-blue-800">⏪ {label}</b>
        <span className="text-muted">의 순간부터 재생해요</span>
        <button type="button" onClick={onClose} className="ml-auto rounded-lg border border-line bg-white px-2 py-1 text-xs hover:bg-page">
          재생 닫기
        </button>
      </div>
      {children}
    </div>
  );
}

/** AI 도우미 대화의 순간 → 그 대화가 들어간 제출(수업 문제) 또는 풀이 기록(연습·학생이 만든 문제)의 재생 */
function ChatReplayPanel({ chatId, at, label, onClose }: { chatId: number; at: number; label: string; onClose: () => void }) {
  const [found, setFound] = useState<{ chatId: number; result: ChatReplay } | null>(null);
  useEffect(() => {
    if (found?.chatId === chatId) return; // 같은 대화의 다른 순간은 다시 찾지 않는다
    findChatReplay(chatId).then((result) => setFound({ chatId, result }));
  }, [chatId, found?.chatId]);
  const r = found?.chatId === chatId ? found.result : null;
  return (
    <ReplayFrame label={label} onClose={onClose}>
      {!r ? (
        <p className="text-sm text-muted">기록을 찾는 중…</p>
      ) : !r.ok ? (
        <p className="text-sm text-muted">{r.error}</p>
      ) : r.kind === "submission" ? (
        <ReplaySection key={at} submissionId={r.submissionId} loader={loadStudentReplay} startAt={at} noteRole="teacher" autoStart />
      ) : (
        <Replayer key={at} init={r.data.init} code={r.data.code} log={r.data.log} chats={r.data.chats} startAt={at} />
      )}
    </ReplayFrame>
  );
}
