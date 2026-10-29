"use client";

import { useEffect, useState, useTransition } from "react";
import Replayer from "@/components/Replayer";
import { loadMyReplay, type ReplayResult } from "./actions";

export type ReplayLoader = (submissionId: number) => Promise<ReplayResult>;

/**
 * 제출 펼침 안: 버튼을 누르면 그때 작성 기록을 불러와 재생기를 연다 (목록에서는 무거운 기록을 안 받음).
 * 학생은 내 기록(loadMyReplay), 교사는 학생 기록을 여는 loader를 넘긴다.
 */
export default function ReplaySection({
  submissionId,
  autoStart = false,
  loader = loadMyReplay,
  startAt,
}: {
  submissionId: number;
  autoStart?: boolean;
  loader?: ReplayLoader;
  /** 이 순간(기록 안의 시각)까지 진행된 화면으로 연다 (업적에서 왔을 때) */
  startAt?: number;
}) {
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [pending, startTransition] = useTransition();
  const load = () => startTransition(async () => setResult(await loader(submissionId)));

  // 학습 여정에서 "과정 보기"로 왔으면 버튼을 누르지 않아도 바로 불러온다
  useEffect(() => {
    if (autoStart) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 열릴 때 한 번만
  }, [autoStart]);

  if (result?.ok) return <Replayer {...result.data} startAt={startAt} />;
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={load}
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
