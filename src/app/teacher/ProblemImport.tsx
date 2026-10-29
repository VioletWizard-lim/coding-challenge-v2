"use client";

import { useRef, useState, useTransition } from "react";
import type { Problem } from "@/lib/problemBank";
import { SUBJECTS } from "@/lib/problems";
import { MAX_WORKSHEET_BYTES, type ExtractedProblem } from "@/lib/worksheet";
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

/** 휴대폰 사진은 크기가 커서, 긴 변 2000px JPEG로 줄인다 (글자는 충분히 읽힌다) */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1_000_000) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
  return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
}

/**
 * 문제 일괄 등록. 두 가지 길이 같은 미리보기 → 반영으로 이어진다.
 * - CSV: 지금 문제 내려받기(= 양식) → 엑셀에서 고치기 → 올리기
 * - 학습지(AI): PDF·사진을 올리면 AI가 읽어 문제로 옮김 → 교사가 확인 후 반영
 */
export default function ProblemImport({
  problems,
  now,
  disabled,
}: {
  problems: Problem[];
  now: string;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<"csv" | "ai" | null>(null);
  const [aiSubject, setAiSubject] = useState(Object.keys(SUBJECTS)[0]);
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

  /** CSV 글을 미리보기로 (CSV 파일과 AI 결과가 함께 쓰는 길) */
  async function preview(text: string) {
    const r = await previewProblemImport(text);
    if (!r.ok) return setMessage(r.message);
    setCsvText(text);
    setRows(r.rows);
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    reset();
    setFileName(file.name);
    const text = decodeCsvFile(await file.arrayBuffer());
    startTransition(() => preview(text));
  }

  /** 학습지 → AI → 문제 목록 → (공개 상태는 지금 그대로 두고) CSV 글로 바꿔 같은 미리보기에 */
  async function pickWorksheet(list: FileList | null) {
    if (!list?.length) return;
    const picked = [...list]; // reset()이 파일 입력을 비우면 FileList도 비므로 먼저 복사
    reset();
    const files = await Promise.all(picked.map(shrinkImage));
    setFileName(files.map((f) => f.name).join(", "));
    if (files.reduce((n, f) => n + f.size, 0) > MAX_WORKSHEET_BYTES) {
      return setMessage("파일이 너무 커요(모두 합쳐 4MB까지). PDF를 나누거나 사진 수를 줄여 주세요.");
    }
    startTransition(async () => {
      const form = new FormData();
      form.set("subject", aiSubject);
      files.forEach((f) => form.append("files", f));
      let data: { ok: boolean; message?: string; problems?: ExtractedProblem[] };
      try {
        const res = await fetch("/api/teacher/worksheet", { method: "POST", body: form });
        data = await res.json();
      } catch {
        return setMessage("학습지를 보내지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
      }
      if (!data.ok || !data.problems) return setMessage(data.message ?? "학습지를 읽지 못했어요.");
      if (!data.problems.length)
        return setMessage("학습지에서 문제를 찾지 못했어요. 문제 표가 잘 보이는 파일인지 확인해 주세요.");
      const nowDate = new Date(now);
      const asProblems: Problem[] = data.problems.map((p) => {
        const existing = problems.find((x) => x.subject === p.subject && x.number === p.number);
        if (!existing) return { ...p, id: null, openAt: null }; // 새 문제는 비공개로
        // 이미 있는 문제: AI가 못 읽은(빈) 칸과 학습지에 없는 시작 코드·공개 상태는 지금 값을 그대로 둔다
        return {
          ...p,
          id: null,
          title: p.title !== p.number ? p.title : existing.title,
          difficulty: p.difficulty ?? existing.difficulty,
          description: p.description || existing.description,
          conditions: p.conditions || existing.conditions,
          examples: p.examples.length ? p.examples : existing.examples,
          goal: p.goal || existing.goal,
          challenge: p.challenge || existing.challenge,
          starterCode: existing.starterCode,
          openAt: existing.openAt,
        };
      });
      await preview(problemsToCsv(asProblems, nowDate));
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
        <h3 className="mr-auto font-bold">📥 한꺼번에 올리기</h3>
        <button
          type="button"
          onClick={() => download("문제목록.csv", "﻿" + problemsToCsv(problems, new Date(now)))}
          className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm"
        >
          ⬇ 지금 문제 내려받기
        </button>
        {(["csv", "ai"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(mode === m ? null : m);
              reset();
            }}
            disabled={disabled}
            className={`rounded-lg border border-brand px-3 py-1.5 text-sm font-bold disabled:opacity-50 ${
              mode === m ? "bg-brand text-white" : "bg-white text-brand"
            }`}
          >
            {m === "csv" ? "⬆ CSV 올리기" : "📄 학습지로 만들기 (AI)"}
          </button>
        ))}
      </div>
      {mode === "ai" && (
        <>
          <ol className="list-decimal pl-5 text-sm text-muted">
            <li>
              학습지 <b>PDF</b>나 <b>사진</b>(jpg, png)을 올리면 AI가 난이도·문제·조건·예시·목표·도전 과제를 읽어 옮겨
              줘요. 한글(HWP) 파일은 한글에서 <b>&lsquo;PDF로 저장&rsquo;</b>해서 올려 주세요.
            </li>
            <li>여러 장이면 한꺼번에 고를 수 있어요 (모두 합쳐 4MB까지). 읽는 데 1~3분 걸릴 수 있어요.</li>
            <li>
              AI가 틀릴 수 있으니 <b>미리보기를 꼭 확인</b>하고 반영하세요. 새 문제는 <b>비공개</b>로 들어가고, 이미
              있는 문제는 공개 상태를 그대로 둬요.
            </li>
          </ol>
          {!done && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <select
                value={aiSubject}
                onChange={(e) => setAiSubject(e.target.value)}
                aria-label="학습지 과목"
                className="rounded-lg border border-line bg-white px-2 py-1.5"
              >
                {Object.keys(SUBJECTS).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <label className="flex flex-wrap items-center gap-3">
                <span className="cursor-pointer rounded-lg border border-brand bg-white px-3 py-1.5 font-bold text-brand hover:bg-brand-soft">
                  학습지 파일 고르기
                </span>
                <span className="text-muted">{fileName || "선택한 파일 없음"}</span>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => pickWorksheet(e.target.files)}
                />
              </label>
            </div>
          )}
        </>
      )}
      {mode === "csv" && (
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
        </>
      )}
      {mode && (
        <>
          {pending && (
            <p className="text-sm text-muted">
              {mode === "ai" ? "🤖 AI가 학습지를 읽는 중이에요… (1~3분 걸릴 수 있어요)" : "확인하는 중…"}
            </p>
          )}
          {message && (
            <p role="alert" className="text-sm text-danger">
              {message}
            </p>
          )}
          {rows && !pending && (
            <>
              {mode === "ai" && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  <span>🤖 AI가 만든 결과입니다. 문제·예시가 학습지와 같은지 확인하고 반영하세요.</span>
                  {csvText && (
                    <button
                      type="button"
                      onClick={() => download("학습지_문제.csv", "\uFEFF" + csvText)}
                      className="ml-auto rounded-md border border-blue-300 bg-white px-2 py-0.5"
                    >
                      CSV로 내려받아 고치기
                    </button>
                  )}
                </div>
              )}
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
