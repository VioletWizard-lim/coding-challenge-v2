"use client";

import { useRef, useState, useTransition } from "react";
import { decodeCsvFile, MAX_ROWS, resultCsv, templateCsv } from "@/lib/studentCsv";
import { importStudents, previewStudents, type ImportResult, type PreviewRow } from "./actions";

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // 바로 지우면 파일 이름이 "download"로 바뀌는 브라우저가 있다
}

const classOf = (grade: number | null, cls: number | null) => (grade || cls ? `${grade ?? "?"}-${cls ?? "?"}` : "");

type Done = Extract<ImportResult, { ok: true }>;

/** CSV로 학생 일괄 등록: 양식 내려받기 → 파일 고르기 → 미리보기 → 등록 → 비밀번호 결과 내려받기 */
export default function StudentImport() {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setCsvText(null);
    setPreview(null);
    setDone(null);
    setMessage(null);
    setFileName("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    reset();
    setFileName(file.name);
    const text = decodeCsvFile(await file.arrayBuffer());
    startTransition(async () => {
      const result = await previewStudents(text);
      if (!result.ok) return setMessage(result.message);
      setCsvText(text);
      setPreview(result.rows);
    });
  }

  function register() {
    if (!csvText) return;
    startTransition(async () => {
      const result = await importStudents(csvText);
      if (!result.ok) return setMessage(result.message);
      setPreview(null);
      setDone(result);
    });
  }

  const newRows = preview?.filter((r) => !r.error && !r.exists) ?? [];
  const addRows = preview?.filter((r) => !r.error && r.plan?.kind === "add") ?? [];
  const sameRows = preview?.filter((r) => !r.error && r.plan?.kind === "same") ?? [];
  const conflictRows = preview?.filter((r) => !r.error && r.plan?.kind === "conflict") ?? [];
  const errorRows = preview?.filter((r) => r.error) ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <h2 className="text-lg font-bold">📥 CSV로 학생 등록</h2>
      <ol className="list-decimal pl-5 text-sm text-muted">
        <li>
          <button
            type="button"
            onClick={() => download("학생등록_양식.csv", "﻿" + templateCsv())}
            className="text-brand underline"
          >
            양식 파일 내려받기
          </button>{" "}
          → 엑셀에서 학생을 채우고 CSV로 저장 (한 번에 {MAX_ROWS}명까지)
        </li>
        <li>
          아이디는 <b>s + 만든 해 두 자리 + 학번</b>을 권해요 (예: 2026년 2학년 3반 1번 → <code>s2620301</code>). 한 학교
          안에서는 해가 바뀌어도 겹치지 않아요. 이미 쓰고 있는 아이디는 그대로 두세요.
        </li>
        <li>과목이 여러 개면 &lsquo;프로그래밍/정보&rsquo;처럼 / 로 나눠 적고, 비우면 모든 과목을 볼 수 있어요.</li>
        <li>초기 비밀번호를 비우면 숫자 6자리를 만들어 줘요.</li>
        <li>
          이미 있는 아이디가 같은 학생(이름이 같음)이면 <b>과목만 더해요</b>. 이름·비밀번호는 바꾸지 않아요. 이름이 다르면 다른
          학생일 수 있어서 건드리지 않고 알려 줘요.
        </li>
      </ol>

      {!done && (
        <label className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-lg border border-brand px-3 py-1.5 font-bold text-brand hover:bg-brand-soft">
            CSV 파일 고르기
          </span>
          <span className="text-muted">{fileName || "선택한 파일 없음"}</span>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </label>
      )}

      {pending && <p className="text-sm text-muted">확인하는 중… (학생이 많으면 몇 초 걸려요)</p>}
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}

      {preview && !pending && (
        <>
          <p className="text-sm">
            <b>✚ 새로 등록 {newRows.length}명</b> · <b className="text-brand">➕ 과목 추가 {addRows.length}명</b> · ⏭ 이미
            있음 {sameRows.length}명 · ⚠️ 다른 학생일 수 있음 {conflictRows.length}명(건너뜀) · ✖ 오류 {errorRows.length}줄(건너뜀)
          </p>
          {conflictRows.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              ⚠️ 이미 다른 사람이 쓰는 아이디가 있어요. 같은 학생이 맞다면 이름을 똑같이 적고, 다른 학생이라면 아이디를 바꿔서
              다시 올려 주세요.
            </p>
          )}
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-page text-muted">
                <tr>
                  {["줄", "상태", "아이디", "이름", "학년-반", "프로그래밍 반", "과목", "비밀번호"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-normal whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr
                    key={r.line}
                    className={`border-t border-line/60 ${
                      r.error ? "bg-red-50" : r.plan?.kind === "conflict" ? "bg-amber-50" : r.plan?.kind === "same" ? "bg-page" : ""
                    }`}
                  >
                    <td className="px-2 py-1.5 text-muted">{r.line}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {r.error ? (
                        <span className="text-danger">✖ {r.error}</span>
                      ) : r.plan?.kind === "add" ? (
                        <span className="font-bold text-brand">➕ 과목 추가: {r.plan.add.join(", ")}</span>
                      ) : r.plan?.kind === "conflict" ? (
                        <span className="text-amber-800">⚠️ {r.plan.reason}</span>
                      ) : r.plan?.kind === "same" ? (
                        <span className="text-muted">⏭ 이미 있음</span>
                      ) : (
                        <span className="text-green-700">✚ 새로 등록</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{r.student.id}</td>
                    <td className="px-2 py-1.5">{r.student.name}</td>
                    <td className="px-2 py-1.5">{classOf(r.student.grade, r.student.class)}</td>
                    <td className="px-2 py-1.5">{classOf(r.student.programmingGrade, r.student.programmingClass)}</td>
                    <td className="px-2 py-1.5">{r.student.subjects ?? <span className="text-muted">전체</span>}</td>
                    <td className="px-2 py-1.5 text-muted">{r.student.password ? "파일에 적음" : "자동 6자리"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={register}
              disabled={newRows.length + addRows.length === 0}
              className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              {[newRows.length && `${newRows.length}명 등록`, addRows.length && `${addRows.length}명 과목 추가`]
                .filter(Boolean)
                .join(" · ") || "등록할 학생 없음"}
              하기
            </button>
            <button type="button" onClick={reset} className="rounded-lg border border-line px-4 py-2">
              취소
            </button>
          </div>
        </>
      )}

      {done && (
        <div className="flex flex-col gap-3">
          <p className="font-bold text-green-700" role="status">
            ✅ {done.created.length}명 등록했어요.
            {done.updated.length > 0 && ` ${done.updated.length}명에게 과목을 더했어요.`}
            {done.skipped.length > 0 && ` (${done.skipped.length}줄 건너뜀)`}
          </p>
          {done.created.length > 0 && (
            <>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                ⚠️ 비밀번호는 이 화면에서만 볼 수 있어요. 아래 버튼으로 꼭 내려받아 두세요. (v1·v2 모두 이 비밀번호로
                로그인)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => download("학생등록_결과_비밀번호.csv", resultCsv(done.created))}
                  className="rounded-lg bg-brand px-4 py-2 font-bold text-white"
                >
                  결과 CSV 내려받기 (아이디·이름·비밀번호)
                </button>
                <button type="button" onClick={reset} className="rounded-lg border border-line px-4 py-2">
                  다른 파일 등록
                </button>
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-page text-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-normal">아이디</th>
                      <th className="px-2 py-1.5 font-normal">이름</th>
                      <th className="px-2 py-1.5 font-normal">비밀번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.created.map((c) => (
                      <tr key={c.id} className="border-t border-line/60">
                        <td className="px-2 py-1.5 font-mono">{c.id}</td>
                        <td className="px-2 py-1.5">{c.name}</td>
                        <td className="px-2 py-1.5 font-mono">
                          {c.password}
                          {c.generated && <span className="ml-1 text-xs text-muted">(자동)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {done.updated.length > 0 && (
            <ul className="list-disc pl-5 text-sm">
              {done.updated.map((u) => (
                <li key={u.id}>
                  {u.id} {u.name}: ➕ {u.added.join(", ")}
                </li>
              ))}
            </ul>
          )}
          {done.skipped.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">건너뛴 줄 {done.skipped.length}개 보기</summary>
              <ul className="mt-1 list-disc pl-5">
                {done.skipped.map((s) => (
                  <li key={s.line}>
                    {s.line}번째 줄 {s.id && `(${s.id})`}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {done.created.length === 0 && (
            <button type="button" onClick={reset} className="self-start rounded-lg border border-line px-4 py-2">
              다른 파일 등록
            </button>
          )}
        </div>
      )}
    </section>
  );
}
