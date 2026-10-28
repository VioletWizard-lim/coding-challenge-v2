"use client";

import { useState, useTransition } from "react";
import Replayer from "@/components/Replayer";
import { loadMyReplay, type ReplayResult } from "./actions";

/** 내 제출 펼침 안: 버튼을 누르면 그때 작성 기록을 불러와 재생기를 연다 (목록에서는 무거운 기록을 안 받음) */
export default function ReplaySection({ submissionId }: { submissionId: number }) {
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) return <Replayer {...result.data} />;
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await loadMyReplay(submissionId)))}
        className="rounded-lg border border-brand px-3 py-1.5 text-sm font-bold text-brand hover:bg-brand-soft disabled:opacity-60"
      >
        {pending ? "불러오는 중…" : "▶ 작성 과정 다시 보기"}
      </button>
      {result && !result.ok && (
        <span role="alert" className="text-sm text-danger">
          {result.error}
        </span>
      )}
    </div>
  );
}
