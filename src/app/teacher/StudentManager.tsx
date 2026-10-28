"use client";

import { useMemo, useState, useTransition } from "react";
import type { StudentRow } from "@/lib/teacher";
import { resetPassword, type ResetResult } from "./actions";

const SHOW_LIMIT = 50;

const classOf = (grade: unknown, cls: unknown) => (grade || cls ? `${grade ?? "?"}-${cls ?? "?"}` : "");

/** 학생 계정 찾기 + 비밀번호 초기화 */
export default function StudentManager({ students }: { students: StudentRow[] }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const matched = useMemo(() => {
    const q = query.trim();
    return q ? students.filter((s) => String(s.id).includes(q) || (s.name ?? "").includes(q)) : students;
  }, [students, query]);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">👥 학생 계정</h2>
        <span className="text-sm text-muted">전체 {students.length}명</span>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="학번이나 이름으로 찾기"
        className="rounded-lg border border-line px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-normal">학번</th>
              <th className="py-2 pr-3 font-normal">이름</th>
              <th className="py-2 pr-3 font-normal">학년-반</th>
              <th className="py-2 pr-3 font-normal">프로그래밍 반</th>
              <th className="py-2 pr-3 font-normal">과목</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {matched.slice(0, SHOW_LIMIT).map((s) => (
              <StudentItem
                key={s.id}
                student={s}
                open={openId === s.id}
                onToggle={() => setOpenId(openId === s.id ? null : s.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {matched.length === 0 && <p className="text-sm text-muted">찾는 학생이 없어요.</p>}
      {matched.length > SHOW_LIMIT && (
        <p className="text-sm text-muted">
          {matched.length}명 중 {SHOW_LIMIT}명만 보여요. 학번이나 이름으로 찾아 주세요.
        </p>
      )}
    </section>
  );
}

function StudentItem({ student: s, open, onToggle }: { student: StudentRow; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-line/60">
        <td className="py-2 pr-3 font-mono">{s.id}</td>
        <td className="py-2 pr-3">{s.name}</td>
        <td className="py-2 pr-3">{classOf(s.grade, s.class)}</td>
        <td className="py-2 pr-3">{classOf(s.programming_grade, s.programming_class)}</td>
        <td className="py-2 pr-3 text-muted">{s.subjects}</td>
        <td className="py-2 text-right">
          <button type="button" onClick={onToggle} className="whitespace-nowrap text-brand hover:underline">
            {open ? "닫기" : "비밀번호 초기화"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line/60 bg-brand-soft/50">
          <td colSpan={6} className="p-3">
            <ResetForm studentId={s.id} name={s.name} />
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
        {name}({studentId}) 학생의 비밀번호를 <b>임의의 숫자 6자리</b>로 새로 만들까요? 지금 비밀번호는 더 이상 쓸 수
        없어요.
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
