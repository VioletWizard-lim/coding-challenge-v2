"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Replayer from "@/components/Replayer";
import type { RecorderHandle } from "@/components/RecordingEditor";
import { MAX_QUESTION, type AiChat } from "@/lib/aiChat";
import type { Recording } from "@/lib/editLog";
import { splitMomentRefs, type Moment } from "@/lib/process-summary";
import { askAiHelper, flagMyAiChat, loadMyAiChats } from "./actions";

/** 자주 묻는 질문 (눌러서 바로 쓰기) */
const STARTERS = ["오류가 왜 나는지 모르겠어요", "어디서부터 고쳐야 할까요?", "다음에 무엇을 해야 할지 모르겠어요"];

/** `print()` 같은 백틱 부분은 코드 글꼴로, **굵게**는 굵은 글씨로 (AI 답의 마크다운 표시를 그대로 보이지 않게) */
function withCode(text: string, keyBase: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-page px-1 font-[family-name:var(--font-code)] text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    return part.replace(/^#{1,6}\s+/gm, ""); // 제목 표시(#)가 섞여 와도 글자만
  });
}

/** AI 답: [[M3]]은 누르면 그 순간의 재생으로 가는 버튼이 된다 */
function Answer({ chat, onMoment }: { chat: AiChat; onMoment: (m: Moment) => void }) {
  return (
    <p className="whitespace-pre-wrap leading-7">
      {splitMomentRefs(chat.answer, chat.moments).map((part, i) =>
        "moment" in part ? (
          <button
            key={i}
            type="button"
            onClick={() => onMoment(part.moment)}
            title="눌러서 이 순간의 재생 보기"
            className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 align-baseline text-sm font-medium text-blue-800 hover:bg-blue-100"
          >
            ⏪ {part.moment.label}
          </button>
        ) : (
          withCode(part.text, String(i))
        ),
      )}
    </p>
  );
}

/**
 * 과정 기반 AI 도우미 (코드 작성 화면 오른쪽 창).
 * 질문하면 지금까지의 작성 기록을 함께 보내고, 서버가 과정 요약을 만들어 AI에 전한다.
 * 질문한 순간은 기록에 [시각, "q"]로 남아 재생 타임라인에 "AI 도움 요청"으로 보인다.
 */
export default function AiHelper({
  subject,
  problem,
  recorder,
  onClose,
}: {
  subject: string;
  problem: string;
  recorder: React.RefObject<RecorderHandle | null>;
  onClose: () => void;
}) {
  const [chats, setChats] = useState<AiChat[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, startTransition] = useTransition();
  const [replay, setReplay] = useState<{ rec: Recording; at: number; label: string } | null>(null);
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const listEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadMyAiChats(subject, problem).then((r) => {
      if (!alive) return;
      if (!r.ok) return setNotice(r.error);
      setNotice(null);
      setChats(r.chats);
      setRemaining(r.remaining);
      setLimit(r.limit);
      setFlagged(new Set(r.chats.filter((c) => c.flaggedBy).map((c) => c.id)));
    });
    return () => {
      alive = false;
    };
  }, [subject, problem]);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "nearest" });
  }, [chats.length, pending]);

  function ask(text = question) {
    const q = text.trim();
    if (!q || pending) return;
    const rec = recorder.current?.getRecording();
    if (!rec) return;
    // 질문 직전까지의 기록을 보내고, 질문한 순간은 기록에 남긴다 (재생 타임라인의 "AI 도움 요청")
    const at = recorder.current?.addMark("q") ?? Date.now();
    setError(null);
    startTransition(async () => {
      const r = await askAiHelper({ subject, problem, question: q, init: rec.init, log: rec.log, at });
      if (r.remaining !== undefined) setRemaining(r.remaining);
      if (!r.ok) {
        if (r.notReady) setNotice(r.error);
        else setError(r.error);
        return;
      }
      setChats((prev) => [...prev, r.chat]);
      setRemaining(r.remaining);
      setQuestion("");
    });
  }

  function openMoment(m: Moment) {
    const rec = recorder.current?.getRecording();
    if (rec) setReplay({ rec, at: m.at, label: m.label });
  }

  function flag(id: number) {
    if (!confirm("이 답이 이상하거나 불편했나요? 선생님께 알릴게요.")) return;
    flagMyAiChat(id).then((r) => {
      if (r.ok) setFlagged((prev) => new Set(prev).add(id));
      else setError(r.error ?? "알리지 못했어요.");
    });
  }

  const outOfQuestions = remaining === 0;

  return (
    <aside
      aria-label="AI 도우미"
      className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-white p-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:self-start"
    >
      <div className="flex items-center gap-2">
        <h2 className="font-bold">🤖 AI 도우미</h2>
        {remaining !== null && limit !== null && (
          <span className="rounded-full bg-page px-2 py-0.5 text-xs text-muted" title="하루에 물어볼 수 있는 횟수">
            오늘 남은 질문 {remaining}/{limit}
          </span>
        )}
        <button type="button" onClick={onClose} className="ml-auto text-sm text-muted hover:text-ink" aria-label="AI 도우미 닫기">
          ✕ 닫기
        </button>
      </div>
      <p className="text-xs leading-5 text-muted">
        AI는 <b>내가 코드를 써 온 과정</b>(실행에 성공한 순간, 반복된 오류, 오래 멈춘 곳)을 보고 힌트를 줘요. 정답 코드는
        알려 주지 않아요. 파란 버튼을 누르면 그 순간의 재생을 볼 수 있어요. 대화는 선생님도 볼 수 있어요.
      </p>

      {notice ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>
      ) : (
        <>
          <div className="flex min-h-24 flex-col gap-3 overflow-y-auto xl:flex-1">
            {chats.length === 0 && !pending && (
              <p className="text-sm text-muted">막히는 곳이 있으면 물어보세요. 아래 예시를 눌러도 돼요.</p>
            )}
            {chats.map((c) => (
              <div key={c.id} className="flex flex-col gap-2">
                <p className="self-end whitespace-pre-wrap rounded-xl rounded-br-sm bg-brand-soft px-3 py-2 text-sm">{c.question}</p>
                <div className="flex flex-col gap-1 rounded-xl rounded-bl-sm border border-line bg-page px-3 py-2 text-sm">
                  <span className="text-xs font-bold text-blue-700">🤖 AI가 만든 답변입니다</span>
                  <Answer chat={c} onMoment={openMoment} />
                  <div className="flex justify-end">
                    {flagged.has(c.id) ? (
                      <span className="text-xs text-muted">🚩 선생님께 알렸어요</span>
                    ) : (
                      <button type="button" onClick={() => flag(c.id)} className="text-xs text-muted hover:text-danger">
                        🚩 이상한 답 알리기
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {pending && <p className="text-sm text-muted">🤖 AI가 내 작성 과정을 살펴보는 중…</p>}
            <div ref={listEnd} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {!outOfQuestions && chats.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  onClick={() => setQuestion(s)}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-brand hover:text-brand"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              // Enter: 보내기 / Shift+Enter: 줄 바꾸기. 한글을 조합하는 중의 Enter는 글자 확정이라 보내지 않는다
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              ask();
            }}
            rows={3}
            maxLength={MAX_QUESTION}
            disabled={outOfQuestions}
            placeholder={outOfQuestions ? "오늘 질문을 모두 썼어요. 내일 다시 물어볼 수 있어요." : "무엇이 막히나요? (Enter로 보내기, Shift+Enter로 줄 바꾸기)"}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-page"
          />
          <button
            type="button"
            onClick={() => ask()}
            disabled={pending || outOfQuestions || !question.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "답을 기다리는 중…" : "물어보기"}
          </button>
        </>
      )}

      {replay && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setReplay(null)}
        >
          <div role="dialog" aria-label="이 순간의 재생" className="mt-10 flex w-full max-w-4xl flex-col gap-3 rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">⏪ {replay.label} — 이 순간의 재생</h3>
              <button type="button" onClick={() => setReplay(null)} className="ml-auto text-sm text-muted hover:text-ink">
                ✕ 닫기
              </button>
            </div>
            <Replayer init={replay.rec.init} code={replay.rec.code} log={replay.rec.log} startAt={replay.at} />
          </div>
        </div>
      )}
    </aside>
  );
}
