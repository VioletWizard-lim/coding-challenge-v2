"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteRequestedStudent, loadDeleteRequests, rejectDeleteRequest, studentRecordCounts, type DeleteRequestsInfo } from "./actions";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type Request = Extract<DeleteRequestsInfo, { ok: true }>["requests"][number];

const STATUS: Record<Request["status"], string> = {
  pending: "⏳ 기다림",
  done: "🗑 지움",
  rejected: "↩ 거절",
  canceled: "취소됨",
};

/**
 * 🧑‍🎓 학생 삭제 요청 (관리자). 교사가 🏫 학생 관리에서 보낸 요청을 보고,
 * ① 그 학생 백업 ZIP → ② 확인 문구("아이디 이름 삭제") → 계정과 모든 기록 삭제. 또는 거절.
 */
export default function DeleteRequests() {
  const [data, setData] = useState<Extract<DeleteRequestsInfo, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    loadDeleteRequests().then((r) => (r.ok ? setData(r) : setError(r.message)));
  }, [reload]);

  const pending = data?.requests.filter((r) => r.status === "pending") ?? [];
  const done = data?.requests.filter((r) => r.status !== "pending").slice(0, 10) ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">🧑‍🎓 학생 삭제 요청 {pending.length > 0 && <span className="text-danger">({pending.length})</span>}</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          교사가 🏫 학생 관리에서 보낸 요청이에요(전학, 잘못 만든 계정, 학생·보호자 요청 등). 지우면 그 학생의 <b>계정과 모든 학년도의 기록</b>이
          지워져요. 먼저 <b>백업 ZIP</b>을 받아 두면 &lsquo;🗓 학년도 말 정리 → ↩ 백업에서 되돌리기&rsquo;로 되살릴 수 있어요.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {data && !data.ready && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 삭제 요청을 쓰려면 Supabase SQL Editor에서 <code>supabase/migrations/020_student_delete_requests.sql</code>을 실행해 주세요.
        </p>
      )}
      {data?.ready && pending.length === 0 && <p className="text-sm text-muted">기다리는 요청이 없어요.</p>}
      {pending.map((r) => (
        <PendingRequest key={r.id} request={r} onDone={() => setReload((n) => n + 1)} />
      ))}
      {done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">최근 처리한 요청 {done.length}건</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {done.map((r) => (
              <li key={r.id} className="text-muted">
                {STATUS[r.status]} · {r.studentId} {r.studentName} · {r.reason}
                {r.handledNote && ` · ${r.handledNote}`} · {r.handledAt ? timeFormat.format(new Date(r.handledAt)) : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function PendingRequest({ request: r, onDone }: { request: Request; onDone: () => void }) {
  const [counts, setCounts] = useState<{ label: string; count: number | null }[] | null>(null);
  const [phrase, setPhrase] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    studentRecordCounts(r.studentId).then((x) => x.ok && setCounts(x.counts));
  }, [r.studentId]);

  const total = counts?.reduce((s, c) => s + (c.count ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/30 px-4 py-3 text-sm">
      <p>
        <b>
          {r.studentId} {r.studentName}
        </b>{" "}
        · 이유: {r.reason} · 요청: {r.requestedBy} · {timeFormat.format(new Date(r.createdAt))}
        {!r.exists && <span className="ml-1 text-muted">(계정은 이미 없음, 남은 기록만 지움)</span>}
      </p>
      <p className="text-xs text-muted">
        지울 기록:{" "}
        {counts
          ? counts
              .filter((c) => c.count)
              .map((c) => `${c.label} ${c.count}`)
              .join(" · ") || "기록 없음"
          : "세는 중…"}
        {counts && ` (모두 ${total.toLocaleString()}건 + 계정)`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/admin/year-backup?student=${encodeURIComponent(r.studentId)}`}
          download
          className="rounded-lg border border-line bg-white px-3 py-1.5 hover:bg-page"
        >
          ① 💾 이 학생 백업 ZIP
        </a>
        <input
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={`② "${r.phrase}"라고 적기`}
          aria-label={`${r.studentId} 확인 문구`}
          className="rounded-lg border border-line bg-white px-3 py-1.5"
        />
        <button
          type="button"
          disabled={pending || phrase.trim() !== r.phrase}
          onClick={() =>
            startTransition(async () => {
              const x = await deleteRequestedStudent(r.id, phrase);
              if (!x.ok) return setMessage(x.message);
              onDone();
            })
          }
          className="rounded-lg bg-danger px-3 py-1.5 font-bold text-white disabled:opacity-40"
        >
          🗑 계정과 모든 기록 지우기
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="거절 이유 (교사에게 보임, 선택)"
          className="min-w-56 flex-1 rounded-lg border border-line bg-white px-3 py-1.5"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const x = await rejectDeleteRequest(r.id, note);
              if (!x.ok) return setMessage(x.message ?? "저장하지 못했어요.");
              onDone();
            })
          }
          className="rounded-lg border border-line bg-white px-3 py-1.5"
        >
          거절
        </button>
      </div>
      {message && <p className="text-danger">{message}</p>}
    </div>
  );
}
