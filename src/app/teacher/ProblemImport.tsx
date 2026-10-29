"use client";

import { useRef, useState, useTransition } from "react";
import type { Problem } from "@/lib/problemBank";
import { problemsToCsv } from "@/lib/problemCsv";
import { decodeCsvFile } from "@/lib/studentCsv";
import { importProblems, previewProblemImport, type ProblemImportResult, type ProblemPreviewRow } from "./actions";

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS = {
  new: { text: "✚ 새 문제", className: "text-green-700" },
  update: { text: "✎ 고침", className: "text-brand" },
  same: { text: "＝ 그대로", className: "text-muted" },
  error: { text: "✖ 건너뜀", className: "text-danger" },
} as const;

/** 문제 일괄 등록: 지금 문제 내려받기(= 양식) → 엑셀에서 고치기 → 올리기 → 미리보기 → 반영 */
export default function ProblemImport({
  problems,
  now,
  disabled,
}: {
  problems: Problem[];
  now: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ProblemPreviewRow[] | null>(null);
  const [done, setDone] = useState<Extract<ProblemImportResult, { ok: true }> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setCsvText(null);
    setRows(null);
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
      const r = await previewProblemImport(text);
      if (!r.ok) return setMessage(r.message);
      setCsvText(text);
      setRows(r.rows);
    });
  }

  function apply() {
    if (!csvText) return;
    startTransition(async () => {
      const r = await importProblems(csvText);
      if (!r.ok) return setMessage(r.message);
      setRows(null);
      setDone(r);
    });
  }

  const count = (s: ProblemPreviewRow["status"]) => rows?.filter((r) => r.status === s).length ?? 0;
  const toApply = count("new") + count("update");
  const hiding = rows?.filter((r) => r.willHide) ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-page/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-bold">📥 CSV로 한꺼번에 올리기</h3>
        <button
          type="button"
          onClick={() => download("문제목록.csv", "﻿" + problemsToCsv(problems, new Date(now)))}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm"
        >
          ⬇ 지금 문제 내려받기
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
            reset();
          }}
          disabled={disabled}
          className="rounded-lg border border-brand bg-white px-3 py-1.5 text-sm font-bold text-brand disabled:opacity-50"
        >
          {open ? "닫기" : "⬆ CSV 올리기"}
        </button>
      </div>
      {open && (
        <>
          <ol className="list-decimal pl-5 text-sm text-muted">
            <li>
              &lsquo;지금 문제 내려받기&rsquo;로 받은 파일을 엑셀에서 열어 고치거나 줄을 더하세요. 이 파일이 곧
              양식이에요.
            </li>
            <li>
              한 칸 안에서 줄을 바꾸려면 <b>Alt + Enter</b>. 난이도는 1~5(또는 ★★★), 예시는 &lsquo;예시1
              입력/출력&rsquo; 칸에 (입력 없는 문제는 입력 칸 비움).
            </li>
            <li>
              공개 칸: <b>공개</b> / <b>비공개</b>(빈칸) / <b>2026-11-03 09:00</b>(그 시각에 공개, 한국 시간).
            </li>
            <li>같은 과목·번호가 이미 있으면 파일 내용으로 바뀌어요. 올리기 전에 미리보기로 확인할 수 있어요.</li>
          </ol>
          {!done && (
            <label className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-lg border border-brand bg-white px-3 py-1.5 font-bold text-brand hover:bg-brand-soft">
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
          {pending && <p className="text-sm text-muted">확인하는 중…</p>}
          {message && (
            <p role="alert" className="text-sm text-danger">
              {message}
            </p>
          )}
          {rows && !pending && (
            <>
              <p className="text-sm">
                <b>
                  ✚ 새 문제 {count("new")}개 · ✎ 고침 {count("update")}개
                </b>{" "}
                · ＝ 그대로 {count("same")}개 · ✖ 건너뜀 {count("error")}개
              </p>
              {hiding.length > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  ⚠️ 지금 공개 중인 문제 {hiding.length}개가 <b>비공개</b>로 바뀌어요 (
                  {hiding.map((r) => r.number).join(", ")}). 공개를 유지하려면 공개 칸에 &lsquo;공개&rsquo;라고 적어
                  주세요.
                </p>
              )}
              <div className="max-h-96 overflow-auto rounded-lg border border-line bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-page text-muted">
                    <tr>
                      {["줄", "상태", "과목", "번호", "제목", "난이도", "예시", "공개", "바뀌는 칸 / 이유"].map((h) => (
                        <th key={h} className="px-2 py-1.5 font-normal whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.line}
                        className={`border-t border-line/60 ${r.status === "error" ? "bg-red-50" : r.willHide ? "bg-amber-50" : ""}`}
                      >
                        <td className="px-2 py-1.5 text-muted">{r.line}</td>
                        <td className={`px-2 py-1.5 whitespace-nowrap ${STATUS[r.status].className}`}>
                          {STATUS[r.status].text}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.subject}</td>
                        <td className="px-2 py-1.5 font-mono">{r.number}</td>
                        <td className="px-2 py-1.5">{r.title === r.number ? "" : r.title}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-amber-500">
                          {r.difficulty ? "★".repeat(r.difficulty) : ""}
                        </td>
                        <td className="px-2 py-1.5">{r.exampleCount || ""}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.openText}</td>
                        <td className="px-2 py-1.5 text-xs text-muted">{r.error ?? r.changes.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={apply}
                  disabled={toApply === 0}
                  className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-50"
                >
                  {toApply}개 반영하기
                </button>
                <button type="button" onClick={reset} className="rounded-lg border border-line bg-white px-4 py-2">
                  취소
                </button>
              </div>
            </>
          )}
          {done && (
            <div className="flex flex-wrap items-center gap-3">
              <p role="status" className="font-bold text-green-700">
                ✅ 새 문제 {done.created}개, 고친 문제 {done.updated}개를 반영했어요.
                {done.skipped > 0 && ` (${done.skipped}줄 건너뜀)`}
              </p>
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm"
              >
                다른 파일 올리기
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
