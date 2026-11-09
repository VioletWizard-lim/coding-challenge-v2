"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Pager from "@/components/Pager";
import { byNumber, classOf, classOptions, inClass } from "@/lib/classes";
import type { StudentRow } from "@/lib/teacher";
import type { DeleteRequest } from "@/lib/deleteRequestStore";
import { cancelDeleteRequest, loadPendingDeleteRequests, requestStudentDelete, resetPassword, type ResetResult } from "./actions";

/** 한 쪽에 보이는 학생 수 (한 반이 보통 30명 안쪽이라 한 반이 한 쪽에 들어가게) */
const PAGE_SIZE = 40;

/** 학생 계정 찾기(반별 보기, 학번·이름 찾기) + 비밀번호 초기화 */
export default function StudentManager({ students }: { students: StudentRow[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  /** 펼친 칸: 비밀번호 초기화 또는 삭제 요청 */
  const [openKind, setOpenKind] = useState<"reset" | "delete">("reset");
  const [page, setPage] = useState(1);
  /** 학생 아이디 → 기다리는 삭제 요청 */
  const [requests, setRequests] = useState<Map<string, DeleteRequest>>(new Map());
  const [requestsReady, setRequestsReady] = useState(true);

  useEffect(() => {
    loadPendingDeleteRequests().then((r) => {
      if (!r.ok) return;
      setRequestsReady(r.ready);
      setRequests(new Map(r.requests.map((x) => [x.studentId, x])));
    });
  }, []);

  const classes = useMemo(() => classOptions(students), [students]);

  const matched = useMemo(() => {
    const q = query.trim();
    return students
      .filter((s) => inClass(s, picked))
      .filter((s) => !q || String(s.id).includes(q) || (s.name ?? "").includes(q))
      .sort((a, b) => byNumber(String(a.id), String(b.id)));
  }, [students, query, picked]);
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = matched.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const goPage = (p: number) => {
    setPage(p);
    setOpenId(null);
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">👥 학생 계정</h2>
        <span className="text-sm text-muted">
          {picked || query.trim() ? `${matched.length}명 / ` : ""}전체 {students.length}명
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={picked}
          onChange={(e) => {
            setPicked(e.target.value);
            goPage(1);
          }}
          aria-label="반"
          className="rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        >
          <option value="">전체 반</option>
          {classes.plain.length > 0 && (
            <optgroup label="학년-반">
              {classes.plain.map((c) => (
                <option key={c} value={`class:${c}`}>
                  {c}반
                </option>
              ))}
            </optgroup>
          )}
          {classes.prog.length > 0 && (
            <optgroup label="프로그래밍 반">
              {classes.prog.map((c) => (
                <option key={c} value={`prog:${c}`}>
                  프로그래밍 {c}반
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            goPage(1);
          }}
          placeholder="아이디나 이름으로 찾기"
          className="min-w-48 flex-1 rounded-lg border border-line px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-normal">아이디</th>
              <th className="py-2 pr-3 font-normal">이름</th>
              <th className="py-2 pr-3 font-normal">학년-반</th>
              <th className="py-2 pr-3 font-normal">프로그래밍 반</th>
              <th className="py-2 pr-3 font-normal">과목</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <StudentItem
                key={s.id}
                student={s}
                open={openId === s.id ? openKind : null}
                onOpen={(kind) => {
                  const same = openId === s.id && openKind === kind;
                  setOpenId(same ? null : s.id);
                  setOpenKind(kind);
                }}
                request={requests.get(String(s.id)) ?? null}
                requestsReady={requestsReady}
                onRequest={(r) =>
                  setRequests((m) => {
                    const next = new Map(m);
                    if (r) next.set(String(s.id), r);
                    else next.delete(String(s.id));
                    return next;
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      {matched.length === 0 && <p className="text-sm text-muted">찾는 학생이 없어요.</p>}
      {pages > 1 && (
        <div className="flex flex-col items-center gap-1.5">
          <Pager page={current} pages={pages} onPage={goPage} />
          <p className="text-xs text-muted">
            {matched.length}명 중 {(current - 1) * PAGE_SIZE + 1}~{Math.min(current * PAGE_SIZE, matched.length)}번째
          </p>
        </div>
      )}
    </section>
  );
}

function StudentItem({
  student: s,
  open,
  onOpen,
  request,
  requestsReady,
  onRequest,
}: {
  student: StudentRow;
  open: "reset" | "delete" | null;
  onOpen: (kind: "reset" | "delete") => void;
  request: DeleteRequest | null;
  requestsReady: boolean;
  onRequest: (r: DeleteRequest | null) => void;
}) {
  return (
    <>
      <tr className="border-b border-line/60">
        <td className="py-2 pr-3 font-mono">{s.id}</td>
        <td className="py-2 pr-3">
          {s.name}
          {request && <span className="ml-1.5 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">삭제 요청됨</span>}
        </td>
        <td className="py-2 pr-3">{classOf(s.grade, s.class)}</td>
        <td className="py-2 pr-3">{classOf(s.programming_grade, s.programming_class)}</td>
        <td className="py-2 pr-3 text-muted">{s.subjects}</td>
        <td className="py-2 text-right">
          <span className="flex justify-end gap-3 whitespace-nowrap">
            <button type="button" onClick={() => onOpen("reset")} className="text-brand hover:underline">
              {open === "reset" ? "닫기" : "비밀번호 초기화"}
            </button>
            {requestsReady && (
              <button type="button" onClick={() => onOpen("delete")} className="text-muted hover:text-danger hover:underline">
                {open === "delete" ? "닫기" : request ? "삭제 요청 보기" : "삭제 요청"}
              </button>
            )}
          </span>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line/60 bg-brand-soft/50">
          <td colSpan={6} className="p-3">
            {open === "reset" ? (
              <ResetForm studentId={s.id} name={s.name} />
            ) : (
              <DeleteRequestForm studentId={s.id} name={s.name} request={request} onRequest={onRequest} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ResetForm({ studentId, name }: { studentId: string; name: string }) {
  const [result, setResult] = useState<ResetResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function reset() {
    setCopied(false);
    startTransition(async () => setResult(await resetPassword(studentId)));
  }

  if (result?.ok) {
    return (
      <div className="flex flex-wrap items-center gap-3" role="status">
        <span className="text-sm">
          {name}({studentId}) 새 비밀번호
        </span>
        <b className="rounded-lg bg-white px-3 py-1 font-mono text-xl tracking-widest">{result.password}</b>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(result.password).then(() => setCopied(true))}
          className="rounded-lg border border-line bg-white px-3 py-1 text-sm"
        >
          {copied ? "복사됨" : "복사"}
        </button>
        <span className="text-xs text-muted">이 창을 닫으면 다시 볼 수 없어요. 학생에게 알려 주세요. (v1·v2 모두 이 비밀번호로 로그인)</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm">
        {name}({studentId}) 학생의 비밀번호를 <b>임의의 숫자 6자리</b>로 새로 만들까요? 지금 비밀번호는 더 이상 쓸 수 없어요.
      </span>
      <button
        type="button"
        onClick={reset}
        disabled={pending}
        className="rounded-lg bg-brand px-3 py-1 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "만드는 중…" : "새 비밀번호 만들기"}
      </button>
      {result && !result.ok && (
        <span role="alert" className="text-sm text-danger">
          {result.message}
        </span>
      )}
    </div>
  );
}

/** 학생 삭제 요청: 지우는 것은 관리자가 백업을 받은 뒤 한다. 교사는 요청·취소만 */
function DeleteRequestForm({
  studentId,
  name,
  request,
  onRequest,
}: {
  studentId: string;
  name: string;
  request: DeleteRequest | null;
  onRequest: (r: DeleteRequest | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (request) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          🗑 {name}({studentId}) 학생 삭제를 관리자에게 요청했어요. 이유: <b>{request.reason}</b>
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await cancelDeleteRequest(request.id);
              if (r.ok) onRequest(null);
              else setMessage(r.message ?? "취소하지 못했어요.");
            })
          }
          className="rounded-lg border border-line bg-white px-3 py-1"
        >
          요청 취소
        </button>
        {message && <span className="text-danger">{message}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        {name}({studentId}) 학생의 <b>계정과 모든 기록</b>(제출·점수·피드백, AI 대화, 성찰, 메모, 연습)을 지우도록 <b>관리자에게 요청</b>해요.
        관리자가 백업을 받은 뒤 지우고, 필요하면 되돌릴 수 있어요.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="삭제 이유 (예: 전학, 잘못 만든 계정, 학생·보호자 요청)"
          className="min-w-64 flex-1 rounded-lg border border-line bg-white px-3 py-1.5"
        />
        <button
          type="button"
          disabled={pending || !reason.trim()}
          onClick={() =>
            startTransition(async () => {
              setMessage(null);
              const r = await requestStudentDelete(studentId, reason);
              if (r.ok) onRequest(r.request);
              else setMessage(r.message);
            })
          }
          className="rounded-lg bg-danger px-3 py-1.5 font-bold text-white disabled:opacity-50"
        >
          관리자에게 삭제 요청
        </button>
      </div>
      {message && <p className="text-danger">{message}</p>}
    </div>
  );
}
