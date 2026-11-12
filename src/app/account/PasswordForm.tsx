"use client";

import { useActionState } from "react";
import { changeMyPassword, type PasswordState } from "../actions";

const inputClass =
  "rounded-lg border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

export default function PasswordForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changeMyPassword, {});
  if (state.ok) {
    return (
      <p role="status" className="rounded-lg bg-green-50 px-3 py-3 text-sm leading-6 text-green-800">
        ✅ 비밀번호를 바꿨어요. 다음에 로그인할 때부터 새 비밀번호를 쓰세요.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      {/* 비밀번호 관리자가 어느 계정의 비밀번호인지 알 수 있게 (화면에는 보이지 않음) */}
      <input type="text" name="username" autoComplete="username" defaultValue={id} hidden readOnly />
      <label className="flex flex-col gap-1 text-sm text-muted">
        지금 비밀번호
        <input name="current" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        새 비밀번호 (6자 이상)
        <input name="next" type="password" autoComplete="new-password" minLength={6} maxLength={64} required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        새 비밀번호 한 번 더
        <input name="again" type="password" autoComplete="new-password" minLength={6} maxLength={64} required className={inputClass} />
      </label>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-gradient-to-br from-brand to-violet-600 py-3 font-bold text-white disabled:opacity-60"
      >
        {pending ? "바꾸는 중…" : "비밀번호 바꾸기"}
      </button>
    </form>
  );
}
