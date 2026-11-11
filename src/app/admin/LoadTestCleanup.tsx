"use client";

import { useEffect, useState, useTransition } from "react";
import { LOAD_TEST_PHRASE } from "@/lib/loadTest";
import { cleanLoadTestAccounts, loadLoadTestAccounts } from "./actions";

/**
 * 🧪 부하 테스트 계정 정리: 아이디가 loadtest로 시작하는 학생 계정과 그 계정의 모든 기록(제출·성찰·AI 대화 등)을 한 번에 지운다.
 * 동시접속 부하 테스트(scripts/load-test.mjs) 뒤에 쓴다. 테스트 계정이 없으면 보이지 않는다.
 */
export default function LoadTestCleanup() {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null);
  const [phrase, setPhrase] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = () => loadLoadTestAccounts().then((r) => (r.ok ? setAccounts(r.accounts) : setMessage({ text: r.message, ok: false })));
  useEffect(() => {
    reload();
  }, []);

  if (!accounts || (accounts.length === 0 && !message)) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <h2 className="text-lg font-bold">🧪 부하 테스트 계정 정리 ({accounts.length}명)</h2>
      <p className="text-sm leading-6 text-muted">
        아이디가 <code>loadtest</code>로 시작하는 학생 계정이에요(동시접속 부하 테스트용). 테스트가 끝나면 계정과 그 계정이 남긴 <b>모든 기록</b>(제출·성찰·AI
        대화 등)을 한 번에 지워 주세요. 다른 학생 계정은 지우지 않아요.
      </p>
      {accounts.length > 0 && (
        <p className="text-xs text-muted">
          {accounts
            .slice(0, 8)
            .map((a) => a.id)
            .join(", ")}
          {accounts.length > 8 && ` 외 ${accounts.length - 8}명`}
        </p>
      )}
      {accounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={`"${LOAD_TEST_PHRASE}"라고 적기`}
            aria-label="확인 문구"
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={pending || phrase.trim() !== LOAD_TEST_PHRASE}
            onClick={() =>
              startTransition(async () => {
                const r = await cleanLoadTestAccounts(phrase);
                if (!r.ok) return setMessage({ text: r.message, ok: false });
                setMessage({ text: `✅ 테스트 계정 ${r.accounts}명과 기록 ${r.records.toLocaleString()}건을 지웠어요.`, ok: true });
                setPhrase("");
                reload();
              })
            }
            className="rounded-lg bg-danger px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {pending ? "지우는 중…" : "🗑 테스트 계정과 기록 모두 지우기"}
          </button>
        </div>
      )}
      {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-danger"}`}>{message.text}</p>}
    </section>
  );
}
