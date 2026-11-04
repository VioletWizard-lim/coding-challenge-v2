"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useStudentNav } from "@/components/SideTabs";
import type { AiChat } from "@/lib/aiChat";
import { classOptions, inClass } from "@/lib/classes";
import type { StudentRow } from "@/lib/teacher";
import { flagAiChat, loadAiChats } from "./actions";

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

/** 교사 화면에서는 [[M3]]을 그 순간의 설명으로 바꿔 보여 준다 */
const readable = (c: AiChat) =>
  c.answer.replace(/\[\[(M\d+)\]\]/g, (all, id: string) => {
    const m = c.moments.find((x) => x.id === id);
    return m ? `‹${m.label}›` : "";
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
  const [data, setData] = useState<{ ready: boolean; chats: AiChat[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    startTransition(async () => {
      const r = await loadAiChats(days);
      if (!r.ok) return setError(r.message);
      setError(null);
      setData({ ready: r.ready, chats: r.chats });
    });
  }, [days, reload]);

  const byId = useMemo(() => new Map(students.map((s) => [String(s.id), s])), [students]);
  const options = useMemo(() => classOptions(students), [students]);
  const inPicked = useMemo(() => students.filter((s) => inClass(s, picked)), [students, picked]);
  const ids = new Set(inPicked.map((s) => String(s.id)));
  const chats = (data?.chats ?? []).filter(
    (c) => (!picked || ids.has(c.userId)) && (!studentId || c.userId === studentId) && (!flaggedOnly || c.flaggedBy),
  );
  const flaggedCount = (data?.chats ?? []).filter((c) => c.flaggedBy).length;

  function toggleFlag(c: AiChat) {
    const next = !c.flaggedBy;
    flagAiChat(c.id, next).then((r) => {
      if (!r.ok) return setError(r.message ?? "저장하지 못했어요.");
      setData((d) =>
        d && { ...d, chats: d.chats.map((x) => (x.id === c.id ? { ...x, flaggedBy: next ? "teacher" : null } : x)) },
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
        학생이 &lsquo;이상한 답 알리기&rsquo;를 누른 대화도 🚩로 보여요. ‹ › 안은 AI가 가리킨 작성 과정의 순간이에요.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
      {data && !data.ready && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ AI 도우미를 쓰려면 Supabase SQL Editor에서 <code>supabase/migrations/010_ai_chats.sql</code>을 실행해 주세요.
          실행 전에는 학생 화면에 &lsquo;선생님이 준비하고 있어요&rsquo;라고 나와요.
        </p>
      )}
      {data?.ready && (
        <p className="text-sm text-muted">{pending ? "불러오는 중…" : `대화 ${chats.length}개`}</p>
      )}
      <ul className={`flex flex-col gap-3 ${pending ? "opacity-50" : ""}`}>
        {chats.map((c) => {
          const s = byId.get(c.userId);
          return (
            <li
              key={c.id}
              className={`flex flex-col gap-2 rounded-lg border px-4 py-3 ${c.flaggedBy ? "border-rose-300 bg-rose-50/40" : "border-line"}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-bold">
                  {c.userId} {s?.name ?? ""}
                </span>
                <span className="text-muted">
                  {c.subject} {problemLabel(c.subject, c.problem)}
                </span>
                <span className="text-muted tabular-nums">{timeFormat.format(new Date(c.createdAt))}</span>
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
                  {c.flaggedBy ? "표시 풀기" : "🚩 부적절한 대화로 표시"}
                </button>
              </div>
              <p className="whitespace-pre-wrap rounded-lg bg-brand-soft px-3 py-2 text-sm">
                <b>질문</b> {c.question}
              </p>
              <p className="whitespace-pre-wrap rounded-lg bg-page px-3 py-2 text-sm leading-6">
                <b className="text-blue-700">🤖 AI 답</b> {readable(c)}
              </p>
            </li>
          );
        })}
      </ul>
      {data?.ready && !pending && chats.length === 0 && <p className="text-sm text-muted">이 조건의 AI 대화가 없어요.</p>}
    </section>
  );
}
