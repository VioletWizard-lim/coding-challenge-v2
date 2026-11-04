"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import ProblemView from "@/components/ProblemView";
import ProblemForm from "./ProblemForm";
import { compareNumber, type Problem } from "@/lib/problemBank";
import { SUBJECTS } from "@/lib/problems";
import {
  cleanDocxHtml,
  DOCX_TYPE,
  looksLike,
  MAX_WORKSHEET_BYTES,
  MAX_WORKSHEET_FILES,
  WORKSHEET_ACCEPT,
  worksheetType,
  type ExtractedProblem,
} from "@/lib/worksheet";
import { problemsToCsv, toKstText } from "@/lib/problemCsv";
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

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

/** 워드(docx)는 브라우저에서 글(표 포함 HTML)만 뽑는다. 그림은 빼므로 파일이 커도 괜찮다 */
async function docxToHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) },
  );
  return cleanDocxHtml(value);
}

/** 학습지(AI) 미리보기의 공개 선택: 그대로(이미 있는 문제) / 비공개 / 바로 공개 / 예약 공개 */
type OpenChoice = { kind: "keep" | "hidden" | "open" | "at"; at?: string };

/** AI가 읽은 문제와, 이미 있던 문제의 지금 공개 시각 (undefined = 새 문제) */
type AiDraft = { problems: Problem[]; existingOpen: (string | null | undefined)[] };

/** datetime-local 값("2026-11-05T09:00", 한국 시간) → ISO */
const kstInputToIso = (v: string) => new Date(`${v}:00+09:00`).toISOString();

/**
 * 문제 일괄 등록. 두 가지 길이 같은 미리보기 → 반영으로 이어진다.
 * - CSV: 지금 문제 내려받기(= 양식) → 엑셀에서 고치기 → 올리기
 * - 학습지(AI): PDF·사진·워드를 올리면 AI가 읽어 문제로 옮김 → 교사가 확인 후 반영
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
  /** 고른 학습지 파일: '확인'을 눌러야 AI에게 보낸다 */
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ProblemPreviewRow[] | null>(null);
  const [done, setDone] = useState<Extract<ProblemImportResult, { ok: true }> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);
  /** 학습지(AI) 결과: 공개 상태를 고르면 이것으로 미리보기를 다시 만든다 */
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null);
  const [choices, setChoices] = useState<OpenChoice[]>([]);
  /** 반영 전에 고치는 중인 문제 (학습지 결과의 몇 번째) */
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setCsvText(null);
    setRows(null);
    setDone(null);
    setMessage(null);
    setFileName("");
    setAiFiles([]);
    setAiDraft(null);
    setChoices([]);
    setEditIndex(null);
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

  /** 학습지 파일 고르기: 목록에만 담고, '확인'을 눌러야 보낸다 */
  function pickWorksheet(list: FileList | null) {
    if (!list?.length) return;
    const picked = [...list]; // reset()이 파일 입력을 비우면 FileList도 비므로 먼저 복사
    reset();
    setAiFiles(picked);
  }

  function removeWorksheet(index: number) {
    setMessage(null);
    setAiFiles((files) => files.filter((_, i) => i !== index));
    if (fileInput.current) fileInput.current.value = ""; // 같은 파일을 다시 고를 수 있게
  }

  /** 학습지 → AI → 문제 목록 → (공개 상태는 지금 그대로 두고) CSV 글로 바꿔 같은 미리보기에 */
  function sendWorksheet() {
    const picked = aiFiles;
    if (!picked.length) return;
    setMessage(null);
    if (picked.length > MAX_WORKSHEET_FILES) return setMessage(`한 번에 ${MAX_WORKSHEET_FILES}개 파일까지 올릴 수 있어요.`);
    startTransition(async () => {
      const form = new FormData();
      form.set("subject", aiSubject);
      let bytes = 0;
      for (const file of picked) {
        const type = worksheetType(file.name, file.type);
        if (!type || !looksLike(type, new Uint8Array(await file.slice(0, 8).arrayBuffer()))) {
          return setMessage(
            `'${file.name}'은(는) 올릴 수 없는 형식이에요. PDF, 워드(docx), 사진(jpg, png)만 올려 주세요. 한글 파일은 'PDF로 저장'해서 올려 주세요.`,
          );
        }
        if (type === DOCX_TYPE) {
          try {
            const html = await docxToHtml(file);
            bytes += new Blob([html]).size;
            form.append("texts", html);
          } catch {
            return setMessage(`'${file.name}'을(를) 열지 못했어요. 워드에서 다시 저장하거나 PDF로 저장해 올려 주세요.`);
          }
          continue;
        }
        // 형식을 비워 보내는 브라우저가 있어 확장자로 정한 형식을 붙인다
        const ready = await shrinkImage(file.type === type ? file : new File([file], file.name, { type }));
        bytes += ready.size;
        form.append("files", ready);
      }
      if (bytes > MAX_WORKSHEET_BYTES) {
        return setMessage("파일이 너무 커요(PDF는 모두 합쳐 4MB까지). PDF를 나눠서 올리거나, 워드 파일이 있으면 워드로 올려 주세요.");
      }
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
      // 미리보기 줄 순서(= CSV 순서)와 맞추려고 과목·번호 순으로 정렬해 둔다
      asProblems.sort((a, b) => a.subject.localeCompare(b.subject) || compareNumber(a.number, b.number));
      const existingOpen = asProblems.map((p) => problems.find((x) => x.subject === p.subject && x.number === p.number)?.openAt);
      const draft = { problems: asProblems, existingOpen };
      const first: OpenChoice[] = existingOpen.map((o) => ({ kind: o === undefined ? "hidden" : "keep" }));
      await previewDraft(draft, first);
    });
  }

  /** 고른 공개 상태로 문제 목록을 CSV 글로 바꿔 미리보기를 다시 만든다 (반영도 이 글로 한다) */
  async function previewDraft(draft: AiDraft, next: OpenChoice[]) {
    const nowDate = new Date(now);
    const withOpen = draft.problems.map((p, i) => {
      const c = next[i];
      const existing = draft.existingOpen[i];
      const openAt =
        c.kind === "keep"
          ? (existing ?? null)
          : c.kind === "hidden"
            ? null
            : c.kind === "open"
              ? existing && new Date(existing) <= nowDate
                ? existing
                : nowDate.toISOString()
              : c.at
                ? kstInputToIso(c.at)
                : null;
      return { ...p, openAt };
    });
    setAiDraft(draft);
    setChoices(next);
    await preview(problemsToCsv(withOpen, nowDate));
  }

  /** 반영 전에 고친 문제를 미리보기에 넣는다 (번호를 바꾸면 이미 있는 문제인지 다시 보고, 순서도 다시 맞춘다) */
  function editDraft(index: number, edited: Problem) {
    if (!aiDraft) return;
    const items = aiDraft.problems.map((p, i) => ({ p, existing: aiDraft.existingOpen[i], choice: choices[i] }));
    const existing = problems.find((x) => x.subject === edited.subject && x.number === edited.number)?.openAt;
    const old = items[index];
    const choice: OpenChoice =
      existing === undefined
        ? old.choice.kind === "keep"
          ? { kind: "hidden" }
          : old.choice
        : old.existing === undefined && old.choice.kind === "hidden"
          ? { kind: "keep" }
          : old.choice;
    items[index] = { p: edited, existing, choice };
    if (items.some((x, i) => i !== index && x.p.subject === edited.subject && x.p.number === edited.number)) {
      return setMessage(`${edited.number}번이 이 학습지에 이미 있어요. 다른 번호로 고쳐 주세요.`);
    }
    items.sort((a, b) => a.p.subject.localeCompare(b.p.subject) || compareNumber(a.p.number, b.p.number));
    setMessage(null);
    setEditIndex(null);
    setOpenRow(items.findIndex((x) => x.p === edited) + 2); // 고친 문제를 펼친 채로
    startTransition(() =>
      previewDraft(
        { problems: items.map((x) => x.p), existingOpen: items.map((x) => x.existing) },
        items.map((x) => x.choice),
      ),
    );
  }

  function choose(index: number, choice: OpenChoice) {
    if (!aiDraft) return;
    if (choice.kind === "at" && !choice.at) {
      // 예약을 고르면 내일 아침 9시를 먼저 넣어 둔다 (바꿀 수 있음)
      const tomorrow = toKstText(new Date(Date.now() + 86_400_000).toISOString()).slice(0, 10);
      choice = { kind: "at", at: `${tomorrow}T09:00` };
    }
    if (choice.kind === "at" && choice.at && new Date(kstInputToIso(choice.at)) <= new Date()) {
      return setMessage("예약 공개 시각은 지금보다 뒤로 정해 주세요.");
    }
    setMessage(null);
    const next = choices.map((c, i) => (i === index ? choice : c));
    startTransition(() => previewDraft(aiDraft, next));
  }

  /** 이미 있는 문제의 지금 공개 상태 (선택 상자의 '그대로' 옆에 보여 줌) */
  const currentOpenText = (iso: string | null | undefined) =>
    !iso ? "비공개" : new Date(iso) <= new Date(now) ? "공개됨" : `${toKstText(iso)} 예약`;

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
            {m === "csv" ? "⬆ CSV 올리기" : "📄 학습지 업로드(AI)"}
          </button>
        ))}
      </div>
      {mode === "ai" && (
        <>
          <ol className="list-decimal pl-5 text-sm text-muted">
            <li>
              학습지 <b>PDF</b>, <b>워드</b>(docx), <b>사진</b>(jpg, png)을 올리면 AI가 난이도·문제·조건·예시·목표·도전 과제를 읽어 옮겨
              줘요. 한글(HWP) 파일은 한글에서 <b>&lsquo;PDF로 저장&rsquo;</b>해서 올려 주세요.
            </li>
            <li>
              파일을 고르고 <b>확인</b>을 누르면 AI가 읽기 시작해요. 여러 장이면 한꺼번에 고를 수 있어요. 사진은 자동으로 줄여서 보내고, 워드는 글만 뽑아 보내서 크기
              걱정이 없어요. PDF는 모두 합쳐 4MB까지예요. 읽는 데 1~3분 걸릴 수 있어요.
            </li>
            <li>
              올린 파일은 AI가 읽는 데만 쓰고 <b>어디에도 저장하지 않아요</b>. 반영을 누른 문제 내용만 저장돼요.
            </li>
            <li>
              AI가 틀릴 수 있으니 <b>미리보기를 꼭 확인</b>하고 반영하세요. 새 문제는 <b>비공개</b>, 이미 있는 문제는
              <b>지금 공개 상태 그대로</b>가 기본이에요. 미리보기의 공개 칸에서 바로 공개·예약 공개로 바꿀 수 있어요.
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
                  {aiFiles.length ? "파일 다시 고르기" : "학습지 파일 고르기"}
                </span>
                {!aiFiles.length && <span className="text-muted">선택한 파일 없음</span>}
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept={WORKSHEET_ACCEPT}
                  className="sr-only"
                  onChange={(e) => pickWorksheet(e.target.files)}
                />
              </label>
            </div>
          )}
          {!done && aiFiles.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-white p-3 text-sm">
              <p className="font-bold">고른 파일 {aiFiles.length}개 ({aiSubject})</p>
              <ul className="flex flex-col gap-1">
                {aiFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                    <span className="min-w-0 truncate">📎 {f.name}</span>
                    <span className="shrink-0 text-muted">{fileSize(f.size)}</span>
                    {!pending && !rows && (
                      <button
                        type="button"
                        onClick={() => removeWorksheet(i)}
                        aria-label={`${f.name} 빼기`}
                        className="shrink-0 text-danger hover:underline"
                      >
                        빼기
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!rows && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={sendWorksheet}
                    disabled={pending}
                    className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-50"
                  >
                    확인 (AI에게 보내기)
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    disabled={pending}
                    className="rounded-lg border border-line bg-white px-4 py-2 disabled:opacity-50"
                  >
                    취소
                  </button>
                </div>
              )}
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
                  {hiding.map((r) => r.number).join(", ")}). 공개를 유지하려면{" "}
                  {aiDraft ? <>공개 칸에서 &lsquo;그대로&rsquo;나 &lsquo;바로 공개&rsquo;를 고르세요.</> : <>공개 칸에 &lsquo;공개&rsquo;라고 적어 주세요.</>}
                </p>
              )}
              <div className="scrollbar-none overflow-x-auto rounded-lg border border-line bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-page text-muted">
                    <tr>
                      {[aiDraft ? "순서" : "줄", "상태", "과목", "번호", "제목", "난이도", "예시", "공개", "바뀌는 칸 / 이유"].map(
                        (h) => (
                          <th key={h} className="px-2 py-1.5 font-normal whitespace-nowrap">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <Fragment key={r.line}>
                        {/* 줄을 누르면 들어갈 문제 내용이 펼쳐진다 */}
                        <tr
                          onClick={() => setOpenRow(openRow === r.line ? null : r.line)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpenRow(openRow === r.line ? null : r.line);
                            }
                          }}
                          tabIndex={0}
                          aria-expanded={openRow === r.line}
                          title={openRow === r.line ? "누르면 접혀요" : "누르면 문제가 보여요"}
                          className={`cursor-pointer border-t border-line/60 ${
                            r.status === "error" ? "bg-red-50" : r.willHide ? "bg-amber-50" : openRow === r.line ? "bg-brand-soft/50" : "hover:bg-page"
                          }`}
                        >
                          <td className="px-2 py-1.5 whitespace-nowrap text-muted">
                            <span className="mr-1 inline-block w-3" aria-hidden>
                              {openRow === r.line ? "▾" : "▸"}
                            </span>
                            {/* CSV는 엑셀 행 번호(1행은 제목 줄)와 같게, 학습지(AI)는 1부터 */}
                            {aiDraft ? r.line - 1 : r.line}
                          </td>
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
                          {aiDraft && choices[r.line - 2] ? (
                            <td
                              className="px-2 py-1.5 whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <div className="flex flex-col gap-1">
                                <select
                                  value={choices[r.line - 2].kind}
                                  disabled={pending}
                                  onChange={(e) => choose(r.line - 2, { kind: e.target.value as OpenChoice["kind"] })}
                                  aria-label={`${r.number} 공개`}
                                  className="rounded-md border border-line bg-white px-1.5 py-1"
                                >
                                  {aiDraft.existingOpen[r.line - 2] !== undefined && (
                                    <option value="keep">그대로 ({currentOpenText(aiDraft.existingOpen[r.line - 2])})</option>
                                  )}
                                  <option value="hidden">비공개</option>
                                  <option value="open">바로 공개</option>
                                  <option value="at">예약 공개</option>
                                </select>
                                {choices[r.line - 2].kind === "at" && (
                                  <input
                                    type="datetime-local"
                                    value={choices[r.line - 2].at ?? ""}
                                    disabled={pending}
                                    onChange={(e) => e.target.value && choose(r.line - 2, { kind: "at", at: e.target.value })}
                                    aria-label={`${r.number} 공개 시각`}
                                    className="rounded-md border border-line bg-white px-1.5 py-1"
                                  />
                                )}
                              </div>
                            </td>
                          ) : (
                            <td className="px-2 py-1.5 whitespace-nowrap">{r.openText}</td>
                          )}
                          <td className="px-2 py-1.5 text-xs text-muted">{r.error ?? r.changes.join(", ")}</td>
                        </tr>
                        {openRow === r.line && (
                          <tr className="border-t border-line/60">
                            <td colSpan={9} className="bg-page/60 p-3">
                              {aiDraft && editIndex === r.line - 2 ? (
                                <ProblemForm
                                  problem={{ ...aiDraft.problems[r.line - 2], id: null }}
                                  now={new Date(now)}
                                  onDraft={(p) => editDraft(r.line - 2, p)}
                                  onCancel={() => setEditIndex(null)}
                                />
                              ) : (
                                <div className="max-w-xl rounded-xl border border-line bg-white p-4">
                                  <div className="mb-2 flex items-center gap-2">
                                    <p className="text-xs text-muted">학생 화면에서 이렇게 보여요</p>
                                    {aiDraft && (
                                      <button
                                        type="button"
                                        onClick={() => setEditIndex(r.line - 2)}
                                        disabled={pending}
                                        className="ml-auto rounded-lg border border-brand bg-white px-3 py-1 text-sm font-bold text-brand hover:bg-brand-soft"
                                      >
                                        ✎ 반영 전에 고치기
                                      </button>
                                    )}
                                  </div>
                                  <ProblemView problem={{ ...r.problem, id: null }} fit />
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
