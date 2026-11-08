"use client";

import { useState, useTransition } from "react";
import type { TeacherRow } from "@/lib/teacher";
import { addTeacher, resetTeacher, type AccountResult } from "./actions";

const inputClass = "rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

/** 교사 계정: 목록·추가·비밀번호 초기화. 만든·바꾼 비밀번호는 한 번만 보여 준다 */
export default function TeacherAccounts({ teachers }: { teachers: TeacherRow[] }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [result, setResult] = useState<AccountResult | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setResult(null);
    startTransition(async () => {
      const r = await addTeacher(id, name);
      setResult(r);
      if (r.ok) {
        setId("");
        setName("");
      }
    });
  }

  function reset(t: TeacherRow) {
    if (!confirm(`${t.name}(${t.id}) 선생님의 비밀번호를 새로 만들까요? 지금 비밀번호는 더 이상 쓸 수 없어요.`)) return;
    setResult(null);
    startTransition(async () => setResult(await resetTeacher(t.id)));
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <h2 className="text-lg font-bold">👩‍🏫 교사 계정</h2>

      <div className="flex flex-col gap-2 rounded-lg bg-page p-3">
        <p className="text-sm font-bold">교사 계정 추가</p>
        <div className="flex flex-wrap gap-2">
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="아이디 (예: teacher02)" aria-label="교사 아이디" className={`${inputClass} w-48`} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: 박선생)" aria-label="교사 이름" className={`${inputClass} w-40`} />
          <button
            type="button"
            onClick={add}
            disabled={pending || !id.trim() || !name.trim()}
            className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            ➕ 추가
          </button>
        </div>
        <p className="text-xs text-muted">
          임시 비밀번호(8자리)를 만들어 한 번만 보여 줘요. 선생님께 전해 주세요. 교사 계정은 v1·v2 모두 이 비밀번호로 로그인해요.
        </p>
      </div>

      {result &&
        (result.ok ? (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-green-300 bg-green-50 px-3 py-2">
            <span className="text-sm">
              <b>{result.id}</b> 비밀번호
            </span>
            <b className="rounded bg-white px-3 py-1 font-mono text-lg tracking-widest">{result.password}</b>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(result.password)}
              className="rounded-lg border border-line bg-white px-3 py-1 text-sm"
            >
              복사
            </button>
            <span className="text-xs text-muted">이 창을 닫으면 다시 볼 수 없어요.</span>
          </div>
        ) : (
          <p role="alert" className="text-sm text-danger">
            {result.message}
          </p>
        ))}

      <table className="w-full text-left text-sm">
        <thead className="text-muted">
          <tr className="border-b border-line">
            <th className="py-2 font-normal">아이디</th>
            <th className="py-2 font-normal">이름</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {teachers.map((t) => (
            <tr key={t.id} className="border-b border-line/60">
              <td className="py-2 font-mono">{t.id}</td>
              <td className="py-2">{t.name} 선생님</td>
              <td className="py-2 text-right">
                <button type="button" onClick={() => reset(t)} disabled={pending} className="text-brand hover:underline">
                  비밀번호 초기화
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {teachers.length === 0 && <p className="text-sm text-muted">교사 계정이 없어요.</p>}
    </section>
  );
}
