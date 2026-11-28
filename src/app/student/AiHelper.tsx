"use client";

import AiNoticeCard, { useAiNotice } from "@/components/AiNotice";
import { useEffect, useRef, useState, useTransition } from "react";
import AiAnswer from "@/components/AiAnswer";
import ReplayModal from "@/components/ReplayModal";
import { quietConfirm } from "@/lib/quietDialog";
import type { RecorderHandle } from "@/components/RecordingEditor";
import { MAX_QUESTION, type AiChat } from "@/lib/aiChat";
import CharCount from "@/components/CharCount";
import type { Recording } from "@/lib/editLog";
import type { Moment } from "@/lib/process-summary";
import type { AskClip } from "@/lib/askBack";
import { askAiHelper, flagMyAiChat, loadMyAiChats, loadMyReplay } from "./actions";

/**
 * 도우미가 쓰는 서버 기능. 기본은 학생 기능(저장·하루 한도·🚩 알리기),
 * 체험 페이지(/try)는 저장하지 않는 체험용을 넘긴다 (flag가 없으면 알리기 버튼을 숨김).
 */
export type HelperBackend = {
  load: () => Promise<{ ok: true; chats: AiChat[]; remaining: number; limit: number } | { ok: false; error: string }>;
  /** threadId: 이 문제의 가장 최근 되물음 id (같은 흐름이면 학생 답으로 보고 AI 힌트) */
  ask: (input: { question: string; init: string; log: unknown; at: number; threadId?: number }) => Promise<
    { ok: true; chat: AiChat; remaining: number } | { ok: false; error: string; remaining?: number; notReady?: boolean }
  >;
  flag?: (id: number) => Promise<{ ok: boolean; error?: string }>;
  /** C 상황(이전 문제 기록)의 작성 기록 불러오기 (그 구간 다시 보기). 없으면 단추를 숨김 */
  openSource?: (clip: AskClip) => Promise<Recording | null>;
  /** 안내 문구 바꾸기 (체험: "대화는 저장하지 않아요") */
  note?: React.ReactNode;
  /** 남은 횟수 앞 글자 (기본 "오늘 남은 질문") */
  remainingLabel?: string;
};

/** 자주 묻는 질문 (눌러서 바로 쓰기) */
const STARTERS = ["오류가 왜 나는지 모르겠어요", "어디서부터 고쳐야 할까요?", "다음에 무엇을 해야 할지 모르겠어요"];

/** AI 답: [[M3]]은 누르면 그 순간의 재생으로 가는 버튼이 된다 */
function Answer({ chat, onMoment }: { chat: AiChat; onMoment: (m: Moment) => void }) {
  return (
    <p className="whitespace-pre-wrap leading-7">
      <AiAnswer chat={chat} onMoment={onMoment} />
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
  practiceId,
  studentProblemId,
  backend: custom,
}: {
  backend?: HelperBackend;
  subject: string;
  problem: string;
  /** 연습 문제에서 열었을 때 (problem은 "P12" 같은 연습 문제 키) */
  practiceId?: number;
  /** 학생이 만든 문제에서 열었을 때 (problem은 "S7") */
  studentProblemId?: number;
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
  /** 재생 창: end가 있으면 그 시각까지만 (되물음이 가리킨 기록의 한 구간) */
  const [replay, setReplay] = useState<{ rec: Recording; at: number; end?: number; label: string } | null>(null);
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const listEnd = useRef<HTMLDivElement>(null);
  const backend: HelperBackend = custom ?? {
    load: () => loadMyAiChats(subject, problem),
    ask: (x) => askAiHelper({ subject, problem, ...x, practiceId, studentProblemId }),
    flag: flagMyAiChat,
    openSource: async (clip) => {
      if (!clip.source?.submissionId) return null;
      const r = await loadMyReplay(clip.source.submissionId);
      return r.ok ? { init: r.data.init, code: r.data.code, log: r.data.log as Recording["log"] } : null;
    },
  };
  /** 가장 최근의 되물음: 그 뒤에 쓰는 말은 되물음에 대한 답이 될 수 있다 (같은 흐름인지는 서버가 정함) */
  const lastAsk = [...chats].reverse().find((c) => c.step === "ask") ?? null;
  const awaitingReply = chats.length > 0 && chats[chats.length - 1].step === "ask";

  useEffect(() => {
    let alive = true;
    backend.load().then((r) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 문제가 바뀔 때만 다시 불러온다
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
    const marked = recorder.current?.addMark("q") ?? null;
    const at = marked ?? Date.now();
    setError(null);
    startTransition(async () => {
      const r = await backend.ask({ question: q, init: rec.init, log: rec.log, at, threadId: lastAsk?.id });
      if (r.remaining !== undefined) setRemaining(r.remaining);
      if (!r.ok) {
        // 답을 받지 못한 질문은 "AI 도움 요청"으로 남기지 않는다 (재생 타임라인에 빈 도움 요청이 생기지 않게)
        if (marked !== null) recorder.current?.removeMark(marked, "q");
        if (r.notReady) setNotice(r.error);
        else setError(r.error);
        return;
      }
      setChats((prev) => [...prev, r.chat]);
      setRemaining(r.remaining);
      setQuestion("");
    });
  }

  /** end: 되물음이 가리킨 구간의 끝 (그때까지만 재생) */
  function openMoment(m: Moment, end?: number | null) {
    const rec = recorder.current?.getRecording();
    // 구간은 그 순간 바로 전부터 보여 준다 (첫 변화도 보이게)
    if (rec) setReplay({ rec, at: end ? m.at - 1 : m.at, end: end ?? undefined, label: m.label });
  }

  /** C 상황: 이전 문제의 기록에서 그 구간 다시 보기 */
  async function openSource(clip: AskClip) {
    if (!backend.openSource || clip.from === null) return;
    const rec = await backend.openSource(clip);
    if (!rec) return setError("그 기록을 불러오지 못했어요.");
    setReplay({ rec, at: clip.from - 1, end: clip.to ?? undefined, label: `지난 ${clip.source?.problem ?? ""} 문제의 기록` });
  }

  function flag(id: number) {
    if (!backend.flag || !quietConfirm("이 답이 이상하거나 불편했나요? 선생님께 알릴게요.")) return;
    backend.flag(id).then((r) => {
      if (r.ok) setFlagged((prev) => new Set(prev).add(id));
      else setError(r.error ?? "알리지 못했어요.");
    });
  }

  const outOfQuestions = remaining === 0;
  // 처음 쓰는 학생은 AI 사용 안내를 읽고 확인해야 물어볼 수 있다
  const { needed: mustReadNotice } = useAiNotice();

  return (
    <aside
      aria-label="AI 도우미"
      className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-white p-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:self-start"
    >
      {/* 첫 줄: 제목과 닫기 버튼 (창이 좁아도 꺾이지 않게) / 둘째 줄: 남은 횟수 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="shrink-0 font-bold whitespace-nowrap">🤖 AI 도우미</h2>
        <button
          type="button"
          onClick={onClose}
          className="order-2 ml-auto shrink-0 rounded-lg border border-line px-2 py-1 text-sm whitespace-nowrap text-muted hover:bg-page hover:text-ink"
          aria-label="AI 도우미 닫기"
        >
          ✕ 닫기
        </button>
        {remaining !== null && limit !== null && (
          <p className="order-3 basis-full">
            <span className="rounded-full bg-page px-2 py-0.5 text-xs whitespace-nowrap text-muted" title="하루에 물어볼 수 있는 횟수">
              {backend.remainingLabel ?? "오늘 남은 질문"} {remaining}/{limit}
            </span>
          </p>
        )}
      </div>
      <p className="text-xs leading-5 text-muted">
        {backend.note ?? (
          <>
        AI는 <b>내가 코드를 써 온 과정</b>(실행에 성공한 순간, 반복된 오류, 오래 멈춘 곳)을 보고 힌트를 줘요. 정답 코드는
        알려 주지 않아요. 파란 버튼을 누르면 그 순간의 재생을 볼 수 있어요. 대화는 선생님도 볼 수 있어요. 이름·학번은 AI에
        보내지 않아요 (
        <a href="/privacy" target="_blank" className="underline hover:text-brand">
          AI 이용 안내
        </a>
        ).
          </>
        )}
      </p>

      {notice ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>
      ) : mustReadNotice ? (
        <AiNoticeCard />
      ) : (
        <>
          <div className="flex min-h-24 flex-col gap-3 overflow-y-auto xl:flex-1">
            {chats.length === 0 && !pending && (
              <p className="text-sm text-muted">막히는 곳이 있으면 물어보세요. 아래 예시를 눌러도 돼요.</p>
            )}
            {chats.map((c) => (
              <div key={c.id} className="flex flex-col gap-2">
                <p className="self-end whitespace-pre-wrap rounded-xl rounded-br-sm bg-brand-soft px-3 py-2 text-sm">{c.question}</p>
                {c.step === "ask" ? (
                  /* 기록으로 되묻기: AI가 아니라 사이트가 내 작성 기록에서 찾아 바로 되물은 것 */
                  <div className="flex flex-col gap-1.5 rounded-xl rounded-bl-sm border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm">
                    <span className="text-xs font-bold text-amber-800">📼 내 작성 기록에서 찾았어요</span>
                    <p className="whitespace-pre-wrap leading-7">
                      <AiAnswer chat={c} onMoment={(m) => openMoment(m, c.clip?.to)} />
                    </p>
                    {c.clip && c.clip.lineVersions.length > 1 && (
                      <div className="rounded-lg border border-line bg-white px-2 py-1.5">
                        <p className="text-xs text-muted">{c.clip.line}번째 줄이 고칠 때마다 바뀐 모습</p>
                        <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-5 font-[family-name:var(--font-code)] text-xs">
                          {c.clip.lineVersions.map((v, i) => (
                            <li key={i} className="whitespace-pre-wrap break-all">
                              {v || "(빈 줄)"}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {c.clip?.source && c.clip.from !== null && backend.openSource && (
                      <button
                        type="button"
                        onClick={() => openSource(c.clip!)}
                        className="self-start rounded-full border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
                      >
                        ⏪ 지난 {c.clip.source.problem} 문제의 그 구간 다시 보기
                      </button>
                    )}
                  </div>
                ) : (
                <div className="flex flex-col gap-1 rounded-xl rounded-bl-sm border border-line bg-page px-3 py-2 text-sm">
                  <span className="text-xs font-bold text-blue-700">🤖 AI가 만든 답변입니다</span>
                  <Answer chat={c} onMoment={openMoment} />
                  <div className={backend.flag ? "flex justify-end" : "hidden"}>
                    {flagged.has(c.id) ? (
                      <span className="text-xs text-muted">🚩 선생님께 알렸어요</span>
                    ) : (
                      <button type="button" onClick={() => flag(c.id)} className="text-xs text-muted hover:text-danger">
                        🚩 이상한 답 알리기
                      </button>
                    )}
                  </div>
                </div>
                )}
              </div>
            ))}
            {pending && (
              <p className="text-sm text-muted">{awaitingReply ? "🤖 AI가 내 답과 작성 과정을 살펴보는 중…" : "📼 내 작성 기록을 살펴보는 중…"}</p>
            )}
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
              // Enter: 줄 바꾸기 / Ctrl(⌘)+Enter: 보내기. 하루 질문 수가 정해져 있어서, 쓰다 만 질문이 Enter로 나가 버리지 않게 한다
              if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              ask();
            }}
            rows={3}
            maxLength={MAX_QUESTION}
            disabled={outOfQuestions}
            placeholder={
              outOfQuestions
                ? "오늘 질문을 모두 썼어요. 내일 다시 물어볼 수 있어요."
                : awaitingReply
                  ? "위 질문에 내 생각을 적어 보세요. '모르겠어요'라고 적어도 돼요. (Ctrl+Enter로 보내기)"
                  : "무엇이 막히나요? (다 쓰고 아래 '물어보기'를 누르거나 Ctrl+Enter)"
            }
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-page"
          />
          <CharCount value={question} max={MAX_QUESTION} hint="코드와 오류 메시지는 AI가 기록에서 함께 봐요. 붙여 넣지 않아도 돼요." />
          <button
            type="button"
            onClick={() => ask()}
            disabled={pending || outOfQuestions || !question.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "답을 기다리는 중…" : awaitingReply ? "답하기" : "물어보기"}
          </button>
        </>
      )}

      {replay && <ReplayModal rec={replay.rec} at={replay.at} end={replay.end} label={replay.label} onClose={() => setReplay(null)} />}
    </aside>
  );
}
