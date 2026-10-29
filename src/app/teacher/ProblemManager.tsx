"use client";

import { Fragment, useState, useTransition } from "react";
import ProblemView from "@/components/ProblemView";
import {
  compareNumber,
  labelOf,
  MAX_EXAMPLES,
  NUMBER_PATTERN,
  openStatus,
  type Example,
  type Problem,
} from "@/lib/problemBank";
import { SUBJECTS } from "@/lib/problems";
import { deleteProblemAction, saveProblemAction, type ProblemResult } from "./actions";
import ProblemImport from "./ProblemImport";

const inputClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

type OpenMode = "now" | "at" | "hidden";

/** ISO 시각 → <input type="datetime-local"> 값 (이 컴퓨터의 시간대 = 한국 시간) */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 다음 번호 추천: 그 과목 마지막 번호의 다음 (예: 3-5 → 3-6) */
function nextNumber(list: Problem[]) {
  const last = list
    .map((p) => p.number)
    .sort(compareNumber)
    .pop();
  if (!last) return "1-1";
  const [u, n] = last.split("-").map(Number);
  return `${u}-${n + 1}`;
}

/** 문제 관리: 과목별 문제 목록, 새 문제·고치기·지우기, 공개 시각 */
export default function ProblemManager({
  problems,
  tableReady,
  fieldsReady,
  now,
}: {
  problems: Problem[];
  tableReady: boolean;
  fieldsReady: boolean;
  now: string;
}) {
  const subjects = Object.keys(SUBJECTS);
  const [subject, setSubject] = useState(subjects[0]);
  const [editing, setEditing] = useState<Problem | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  /** 저장·삭제 결과를 어느 문제 줄 아래에 보여 줄지 (새 문제는 맨 위) */
  const [messageAt, setMessageAt] = useState<string | null>(null);
  const [message, setMessage] = useState<ProblemResult | null>(null);
  const list = problems.filter((p) => p.subject === subject);
  const nowDate = new Date(now);

  function startNew() {
    setMessage(null);
    setEditing({
      id: null,
      subject,
      number: nextNumber(list),
      title: "",
      difficulty: null,
      description: "",
      conditions: "",
      examples: [],
      goal: "",
      challenge: "",
      starterCode: "",
      openAt: null,
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-bold">📚 문제 관리</h2>
        <select
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setEditing(null);
          }}
          aria-label="과목"
          className={inputClass}
        >
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={startNew}
          disabled={!tableReady}
          className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          ＋ 새 문제
        </button>
      </div>

      {!tableReady && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 문제 관리를 쓰려면 Supabase SQL Editor에서 <code>supabase/migrations/003_problems.sql</code>을 실행해
          주세요. 지금은 코드에 들어 있는 문제 목록을 보여 줘요(고칠 수 없음).
        </p>
      )}
      <ProblemImport problems={problems} now={now} disabled={!tableReady || !fieldsReady} />

      {tableReady && !fieldsReady && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 난이도·조건·예시·문제 목표·도전 과제를 저장하려면 Supabase SQL Editor에서{" "}
          <code>supabase/migrations/004_problem_fields.sql</code>을 실행해 주세요.
        </p>
      )}
      <p className="text-sm text-muted">
        공개 시각이 되면 학생 화면에 문제가 나타나요. 그 전에는 학생에게 제목도 보이지 않아요. 시각은 한국 시간이에요.
      </p>

      {message && messageAt === null && <Notice result={message} />}

      {/* 새 문제는 맨 위에서, 이미 있는 문제는 그 줄 바로 아래에서 고친다 */}
      {editing && editing.id === null && (
        <ProblemForm
          key={`new-${editing.number}`}
          problem={editing}
          now={nowDate}
          onDone={(r) => {
            setMessage(r);
            setMessageAt(null);
            if (r.ok) setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-normal">번호</th>
              <th className="py-2 pr-3 font-normal">제목</th>
              <th className="py-2 pr-3 font-normal">난이도</th>
              <th className="py-2 pr-3 font-normal">내용</th>
              <th className="py-2 pr-3 font-normal">공개</th>
              <th className="py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const status = openStatus(p, nowDate);
              const isEditing = editing !== null && editing.id !== null && editing.id === p.id;
              const isViewing = viewing === p.number && !isEditing;
              return (
                <Fragment key={p.number}>
                  <tr className={`border-b border-line/60 ${isEditing || isViewing ? "bg-brand-soft/50" : ""}`}>
                    <td className="py-2 pr-3 font-mono">{p.number}</td>
                    <td className="py-2 pr-3">
                      {p.title === p.number ? <span className="text-muted">(제목 없음)</span> : p.title}
                    </td>
                    <td
                      className="py-2 pr-3 whitespace-nowrap text-amber-500"
                      aria-label={p.difficulty ? `별 ${p.difficulty}개` : "난이도 없음"}
                    >
                      {p.difficulty ? "★".repeat(p.difficulty) : <span className="text-muted">–</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">
                      {[
                        p.description && "문제",
                        p.conditions && "조건",
                        p.examples.length && `예시 ${p.examples.length}`,
                        p.goal && "목표",
                        p.challenge && "도전",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "–"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {status.kind === "open" && <span className="text-green-700">● {status.text}</span>}
                      {status.kind === "scheduled" && <span className="text-amber-700">◷ {status.text}</span>}
                      {status.kind === "hidden" && <span className="text-muted">○ {status.text}</span>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setViewing(isViewing ? null : p.number)}
                        className="mr-3 text-muted hover:text-brand hover:underline"
                      >
                        {isViewing ? "접기" : "보기"}
                      </button>
                      {tableReady && (
                        <button
                          type="button"
                          onClick={() => {
                            setMessage(null);
                            setViewing(null);
                            setEditing(isEditing ? null : p);
                          }}
                          className="text-brand hover:underline"
                        >
                          {isEditing ? "닫기" : "고치기"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isViewing && (
                    <tr className="border-b border-line/60">
                      <td colSpan={6} className="bg-page/60 p-4">
                        <div className="max-w-xl rounded-xl border border-line bg-white p-4">
                          <p className="mb-2 text-xs text-muted">학생 화면에서 이렇게 보여요</p>
                          <ProblemView problem={p} />
                        </div>
                      </td>
                    </tr>
                  )}
                  {isEditing && (
                    <tr>
                      <td colSpan={6} className="py-2">
                        <ProblemForm
                          key={p.id ?? p.number}
                          problem={editing}
                          now={nowDate}
                          onDone={(r) => {
                            setMessage(r);
                            setMessageAt(p.number);
                            if (r.ok) setEditing(null);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  )}
                  {message && messageAt === p.number && !isEditing && (
                    <tr>
                      <td colSpan={6} className="pb-2">
                        <Notice result={message} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <p className="py-4 text-sm text-muted">이 과목에는 아직 문제가 없어요.</p>}
      </div>
    </section>
  );
}

function Notice({ result }: { result: ProblemResult }) {
  return (
    <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-green-700" : "text-danger"}`}>
      {result.message}
    </p>
  );
}

function ProblemForm({
  problem,
  now,
  onDone,
  onCancel,
}: {
  problem: Problem;
  now: Date;
  onDone: (r: ProblemResult) => void;
  onCancel: () => void;
}) {
  const alreadyOpen = problem.openAt !== null && new Date(problem.openAt) <= now;
  const [number, setNumber] = useState(problem.number);
  const [title, setTitle] = useState(problem.title === problem.number ? "" : problem.title);
  const [difficulty, setDifficulty] = useState<number | null>(problem.difficulty);
  const [description, setDescription] = useState(problem.description);
  const [conditions, setConditions] = useState(problem.conditions);
  const [examples, setExamples] = useState<Example[]>(
    problem.examples.length ? problem.examples : [{ input: "", output: "" }],
  );
  const [goal, setGoal] = useState(problem.goal);
  const [challenge, setChallenge] = useState(problem.challenge);
  const [starterCode, setStarterCode] = useState(problem.starterCode);
  const [mode, setMode] = useState<OpenMode>(problem.openAt === null ? "hidden" : alreadyOpen ? "now" : "at");
  const [openAtLocal, setOpenAtLocal] = useState(problem.openAt && !alreadyOpen ? toLocalInput(problem.openAt) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!NUMBER_PATTERN.test(number.trim())) return setError("번호는 '2-3'처럼 단원-번호로 적어 주세요.");
    if (!title.trim()) return setError("제목을 적어 주세요.");
    if (mode === "at" && !openAtLocal) return setError("공개할 날짜와 시각을 고르세요.");
    // 이미 공개된 문제를 "지금 공개"로 두면 처음 공개 시각을 그대로 둔다
    const openAt =
      mode === "hidden"
        ? null
        : mode === "at"
          ? new Date(openAtLocal).toISOString()
          : alreadyOpen
            ? problem.openAt
            : new Date().toISOString();
    setError(null);
    startTransition(async () => {
      const r = await saveProblemAction(problem.id, {
        subject: problem.subject,
        number: number.trim(),
        title,
        difficulty,
        description,
        conditions,
        examples: examples.filter((e) => e.input.trim() || e.output.trim()),
        goal,
        challenge,
        starterCode,
        openAt,
      });
      if (r.ok) onDone(r);
      else setError(r.message);
    });
  }

  function remove() {
    if (problem.id === null) return;
    if (
      !confirm(
        `${problem.subject} ${problem.number}번 문제를 지울까요? 학생 화면에서 사라져요. 이미 낸 제출은 그대로 남아요.`,
      )
    )
      return;
    startTransition(async () => onDone(await deleteProblemAction(problem.id!)));
  }

  // 지금 입력 중인 내용을 학생 화면처럼 바로 보여 준다
  const preview: Problem = {
    ...problem,
    number: number.trim() || problem.number,
    title: title.trim() || number.trim() || problem.number,
    difficulty,
    description,
    conditions,
    examples: examples.filter((e) => e.input.trim() || e.output.trim()),
    goal,
    challenge,
  };

  return (
    <div className="grid gap-4 rounded-xl border-2 border-brand/40 bg-brand-soft/30 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="font-bold">
          {problem.id === null ? `새 문제 (${problem.subject})` : `고치기: ${problem.subject} ${labelOf(problem)}`}
        </h3>
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <label className="flex flex-col gap-1 text-sm text-muted">
            번호
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="2-3"
              className={`${inputClass} font-mono`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="내가 가진 용돈 확인하기"
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex flex-col gap-1 text-sm text-muted">
          난이도
          <div className="flex items-center gap-1" role="radiogroup" aria-label="난이도">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={difficulty === n}
                aria-label={`별 ${n}개`}
                onClick={() => setDifficulty(difficulty === n ? null : n)}
                className={`text-2xl leading-none ${difficulty !== null && n <= difficulty ? "text-amber-500" : "text-slate-300"}`}
              >
                ★
              </button>
            ))}
            <span className="ml-2 text-xs">
              {difficulty ? `별 ${difficulty}개` : "정하지 않음"} (같은 별을 다시 누르면 지워져요)
            </span>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm text-muted">
          문제
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="용돈과 과자 가격을 입력받아, 과자를 살 수 있는지 출력하는 프로그램을 만드세요."
            className={`${inputClass} leading-6`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          조건 (한 줄에 하나씩, 학생 화면에 1. 2. 3. 번호가 붙어요)
          <textarea
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            rows={3}
            placeholder={
              "input()을 4번 이상 사용할 것 (이름, 반찬, 밥 종류, 국 종류)\n추천 조합 메뉴는 밥 종류와 반찬을 결합해서 새로 만들 것\n예시와 같은 형태로 여러 줄에 걸쳐 출력할 것"
            }
            className={`${inputClass} leading-6`}
          />
        </label>
        <fieldset className="flex flex-col gap-2 text-sm text-muted">
          <legend className="mb-1">
            예시 (입력값이 여러 개면 &lsquo;길동 / 돈까스 / 볶음밥 / 된장국&rsquo;처럼, 입력이 없는 문제는 비워 두세요)
          </legend>
          {examples.map((ex, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line bg-white p-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="flex flex-col gap-1">
                <span className="text-xs">예시 {i + 1} 입력</span>
                <textarea
                  value={ex.input}
                  onChange={(e) => setExamples(examples.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))}
                  rows={2}
                  spellCheck={false}
                  className={`${inputClass} font-[family-name:var(--font-code)] text-sm`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs">예시 {i + 1} 출력</span>
                <textarea
                  value={ex.output}
                  onChange={(e) =>
                    setExamples(examples.map((x, j) => (j === i ? { ...x, output: e.target.value } : x)))
                  }
                  rows={2}
                  spellCheck={false}
                  className={`${inputClass} font-[family-name:var(--font-code)] text-sm`}
                />
              </label>
              <button
                type="button"
                onClick={() => setExamples(examples.filter((_, j) => j !== i))}
                className="self-end rounded-lg px-2 py-1 text-xs text-danger hover:bg-red-50"
                aria-label={`예시 ${i + 1} 지우기`}
              >
                지우기
              </button>
            </div>
          ))}
          {examples.length < MAX_EXAMPLES && (
            <button
              type="button"
              onClick={() => setExamples([...examples, { input: "", output: "" }])}
              className="self-start rounded-lg border border-line bg-white px-3 py-1 text-sm"
            >
              ＋ 예시 추가
            </button>
          )}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm text-muted">
          문제 목표
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            placeholder="입력값을 정수로 바꾸고, 조건문으로 두 경우를 나눌 수 있다."
            className={`${inputClass} leading-6`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          도전 과제 (경험자용, 선택)
          <textarea
            value={challenge}
            onChange={(e) => setChallenge(e.target.value)}
            rows={2}
            placeholder="과자를 여러 개 살 때 몇 개까지 살 수 있는지도 출력해 보세요."
            className={`${inputClass} leading-6`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          시작 코드 (선택, 학생 편집기에 처음부터 들어 있음)
          <textarea
            value={starterCode}
            onChange={(e) => setStarterCode(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder={"money = int(input())\n# 여기에 코드를 이어서 작성하세요"}
            className={`${inputClass} font-[family-name:var(--font-code)] text-sm`}
          />
        </label>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 text-muted">공개</legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "now"} onChange={() => setMode("now")} />
            {alreadyOpen ? "공개 중 (그대로 두기)" : "저장하면 바로 공개"}
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" checked={mode === "at"} onChange={() => setMode("at")} />
            공개 시각 정하기
            <input
              type="datetime-local"
              value={openAtLocal}
              onChange={(e) => {
                setOpenAtLocal(e.target.value);
                setMode("at");
              }}
              className={`${inputClass} py-1`}
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "hidden"} onChange={() => setMode("hidden")} />
            비공개 (학생에게 안 보임)
          </label>
        </fieldset>
        {problem.id !== null && problem.number !== number.trim() && (
          <p className="text-xs text-amber-800">
            번호를 바꾸면 학생 화면에서 다른 문제가 돼요. 이미 낸 제출은 옛 번호로 남아요.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-60"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
          <button type="button" onClick={onCancel} className="rounded-lg border border-line bg-white px-4 py-2">
            취소
          </button>
          {problem.id !== null && (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="ml-auto rounded-lg px-3 py-2 text-sm text-danger hover:bg-red-50"
            >
              문제 지우기
            </button>
          )}
        </div>
      </div>
      <aside className="flex min-w-0 flex-col gap-2 xl:sticky xl:top-20 xl:self-start">
        <p className="text-xs font-bold text-muted">학생 화면 미리보기</p>
        <div className="rounded-xl border border-line bg-white p-4">
          <ProblemView problem={preview} />
        </div>
      </aside>
    </div>
  );
}
