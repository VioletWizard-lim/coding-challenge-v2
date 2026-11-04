"use client";

import { useState, useTransition } from "react";
import AiAnswer from "@/components/AiAnswer";
import { MAX_REVIEW_ANSWER, type AiReview } from "@/lib/aiReview";
import { flagAiReview } from "../teacher/actions";
import { flagMyReview, saveMyReviewAnswers, startMyReview } from "./actions";

/**
 * AI 되돌아보기 (재생기 아래). 학생: 질문을 받고 답을 적는다. 교사: 질문과 학생 답을 읽고 🚩 표시한다.
 * 질문마다 AI가 짚은 순간 버튼이 있어 누르면 재생기가 그 시점으로 간다.
 */
export default function ReviewPanel({
  submissionId,
  role,
  ready,
  initial,
  seek,
}: {
  submissionId: number;
  role: "student" | "teacher";
  /** false면 011 실행 전 */
  ready: boolean;
  initial: AiReview | null;
  seek: (t: number) => void;
}) {
  const [review, setReview] = useState(initial);
  const [answers, setAnswers] = useState<string[]>(initial?.questions.map((q) => q.answer) ?? []);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [flagged, setFlagged] = useState(initial?.flaggedBy ?? null);

  if (role === "teacher" && !review) return null;
  if (!ready) {
    return role === "student" ? <p className="text-xs text-muted">🤖 AI와 되돌아보기는 선생님이 준비하고 있어요.</p> : null;
  }

  function start() {
    setMessage(null);
    startTransition(async () => {
      const r = await startMyReview(submissionId);
      if (!r.ok) return setMessage({ text: r.error, ok: false });
      setReview(r.review);
      setAnswers(r.review.questions.map((q) => q.answer));
    });
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const r = await saveMyReviewAnswers(submissionId, answers);
      if (!r.ok) return setMessage({ text: r.error, ok: false });
      setReview(r.review);
      setMessage({ text: "✅ 내 답을 저장했어요. 선생님도 볼 수 있어요.", ok: true });
    });
  }

  function flag() {
    if (!review) return;
    if (role === "student") {
      if (!confirm("이 질문이 이상하거나 불편했나요? 선생님께 알릴게요.")) return;
      flagMyReview(review.id).then((r) => (r.ok ? setFlagged("student") : setMessage({ text: r.error ?? "알리지 못했어요.", ok: false })));
    } else {
      const next = !flagged;
      flagAiReview(review.id, next).then((r) =>
        r.ok ? setFlagged(next ? "teacher" : null) : setMessage({ text: r.message ?? "저장하지 못했어요.", ok: false }),
      );
    }
  }

  if (!review) {
    return (
      <section aria-label="AI와 되돌아보기" className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
        <p className="font-bold">🤖 AI와 되돌아보기</p>
        <p className="text-sm leading-6 text-muted">
          AI가 내 작성 과정에서 기억할 만한 순간(오류를 고친 때, 오래 멈춘 때 등)을 골라 질문해요. 그 순간을 다시 보며 답하면서 내가 어떻게
          생각했는지 돌아봐요. 정답을 알려 주지는 않아요.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={start}
            disabled={pending}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {pending ? "AI가 내 과정을 살펴보는 중…" : "질문 받기"}
          </button>
          {message && (
            <p role="alert" className="text-sm text-danger">
              {message.text}
            </p>
          )}
        </div>
      </section>
    );
  }

  const changed = review.questions.some((q, i) => q.answer !== (answers[i] ?? ""));
  return (
    <section aria-label="AI와 되돌아보기" className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">🤖 AI와 되돌아보기</p>
        <span className="text-xs font-bold text-blue-700">AI가 만든 질문입니다</span>
        {flagged && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
            🚩 {flagged === "student" ? "학생이 알림" : "교사 표시"}
          </span>
        )}
        <button
          type="button"
          onClick={flag}
          disabled={role === "student" && !!flagged}
          className="ml-auto text-xs text-muted hover:text-danger disabled:hidden"
        >
          {role === "student" ? "🚩 이상한 질문 알리기" : flagged ? "표시 풀기" : "🚩 부적절한 내용으로 표시"}
        </button>
      </div>
      {review.intro && (
        <p className="leading-7">
          <AiAnswer chat={{ answer: review.intro, moments: [] }} />
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {review.questions.map((q, i) => (
          <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-bold text-violet-700">질문 {i + 1}</span>
              {q.moment && (
                <button
                  type="button"
                  onClick={() => seek(q.moment!.at)}
                  title="눌러서 이 순간의 재생 보기"
                  className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
                >
                  ⏪ {q.moment.label}
                </button>
              )}
            </div>
            <p className="leading-7">
              <AiAnswer chat={{ answer: q.question, moments: [] }} />
            </p>
            {role === "student" ? (
              <textarea
                value={answers[i] ?? ""}
                onChange={(e) => setAnswers((list) => list.map((a, k) => (k === i ? e.target.value : a)))}
                rows={2}
                maxLength={MAX_REVIEW_ANSWER}
                aria-label={`질문 ${i + 1}에 대한 내 답`}
                placeholder="그때 어떤 생각을 했는지 적어 보세요."
                className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
            ) : (
              <p className="whitespace-pre-wrap rounded-lg bg-brand-soft px-3 py-2 text-sm">
                <b>학생 답</b> {q.answer || <span className="text-muted">(아직 안 씀)</span>}
              </p>
            )}
          </li>
        ))}
      </ol>
      {role === "student" && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || !changed}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {pending ? "저장 중…" : "내 답 저장"}
          </button>
          {message && (
            <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-green-700" : "text-danger"}`}>
              {message.text}
            </p>
          )}
        </div>
      )}
      {role === "teacher" && message && <p className="text-sm text-danger">{message.text}</p>}
    </section>
  );
}
