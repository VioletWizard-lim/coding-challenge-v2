"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-muted">
        아이디
        <input
          name="id"
          defaultValue={state.id}
          autoComplete="username"
          placeholder="아이디를 입력하세요"
          required
          className="rounded-lg border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호를 입력하세요"
          required
          className="rounded-lg border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
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
        {pending ? "확인 중…" : "입장하기"}
      </button>
    </form>
  );
}
