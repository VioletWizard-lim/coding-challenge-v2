"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import RecordingEditor, { type RecorderHandle } from "@/components/RecordingEditor";
import { storageKeyFor } from "@/lib/editLog";
import { judge, MAX_TESTS, MIN_TESTS, type TestOutcome } from "@/lib/practice";
import {
  inputLines,
  MAX_CONDITIONS,
  MAX_DESCRIPTION,
  MAX_TITLE,
  STATUS_LABEL,
  studentAsProblem,
  studentProblemKey,
  type Share,
  type StudentProblem,
  type StudentProblemInput,
} from "@/lib/studentProblem";
import {
  deleteMyProblem,
  flagStudentProblem,
  loadMyProblemForEdit,
  loadStudentProblems,
  loadStudentProblemWork,
  saveMyProblem,
  saveStudentProblemCheck,
  type StudentProblemsResult,
} from "./myProblemActions";
import { Outcomes, runTests } from "@/components/TestOutcomes";
import ProblemSolver from "./ProblemSolver";
import { quietConfirm } from "@/lib/quietDialog";

const inputClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

type Data = Extract<StudentProblemsResult, { ok: true }>;
type View = { kind: "list" } | { kind: "edit"; id?: number } | { kind: "solve"; id: number };

const solvedText = (p: StudentProblem) =>
  p.solvedAt ? "✅ 통과" : p.passed !== null ? `${p.passed}/${p.tests.length} 통과` : "아직 안 풀어 봄";

/**
 * ✏️ 직접 만든 문제: 학생이 문제·예시·내 답을 만들고(내 답으로 예시를 모두 통과해야 저장),
 * "나만 풀기" 또는 "선생님 승인 후 같은 반 친구와 풀기"를 고른다. 친구에게는 만든 사람과 답이 보이지 않는다.
 */
export default function MyProblems({ userId, subjects }: { userId: string; subjects: string[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [message, setMessage] = useState<string | null>(null);

  const reload = () =>
    loadStudentProblems().then((r) => {
      if (!r.ok) return setError(r.error);
      setError(null);
      setData(r);
    });
  useEffect(() => {
    reload();
  }, []);

  if (error) return <p className="rounded-lg bg-amber-50 px-4 py-3 text-amber-900">{error}</p>;
  if (!data) return <p className="text-muted">불러오는 중…</p>;
  if (!data.ready) return <p className="rounded-lg bg-amber-50 px-4 py-3 text-amber-900">선생님이 이 기능을 준비하고 있어요.</p>;

  if (view.kind === "edit") {
    return (
      <ProblemEditor
        key={view.id ?? "new"}
        userId={userId}
        subjects={subjects}
        id={view.id}
        onDone={(text) =>
          // 새 목록을 받은 뒤에 목록으로 돌아간다 (방금 만든 문제가 바로 보이게)
          reload().then(() => {
            setMessage(text);
            setView({ kind: "list" });
          })
        }
        onCancel={() => setView({ kind: "list" })}
      />
    );
  }

  const all = [...data.mine, ...data.classmates];
  const open = view.kind === "solve" ? all.find((p) => p.id === view.id) : undefined;
  if (open) {
    return (
      <ProblemSolver
        key={open.id}
        userId={userId}
        subject={open.subject}
        problemKey={studentProblemKey(open.id)}
        view={studentAsProblem(open)}
        tests={open.tests}
        starterCode={open.starterCode}
        badge={open.mine ? "✏️ 내가 만든 문제입니다" : "👥 우리 반 친구가 만든 문제입니다 (선생님이 확인했어요)"}
        solvedAt={open.solvedAt}
        checks={open.checks}
        flagged={open.flaggedBy !== null}
        ai={{ studentProblemId: open.id }}
        backLabel="직접 만든 문제 목록"
        onBack={() => setView({ kind: "list" })}
        save={(work) => saveStudentProblemCheck(open.id, work)}
        loadSaved={() => loadStudentProblemWork(open.id)}
        flag={() => flagStudentProblem(open.id)}
        onSaved={(patch) =>
          setData((d) => d && { ...d, [open.mine ? "mine" : "classmates"]: (open.mine ? d.mine : d.classmates).map((p) => (p.id === open.id ? { ...p, ...patch } : p)) })
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-muted">
          문제를 직접 만들어 보면 그 개념을 더 깊이 알게 돼요. 내 답으로 예시를 모두 통과해야 저장돼요.
        </p>
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setView({ kind: "edit" });
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
        >
          ✏️ 새 문제 만들기
        </button>
      </div>
      {message && (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-800">
          {message}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="font-bold">✏️ 내가 만든 문제 ({data.mine.length})</h3>
        {data.mine.length ? (
          <ul className="flex flex-col gap-2">
            {data.mine.map((p) => (
              <li key={p.id} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-bold">{p.title}</span>
                  {subjects.length > 1 && <span className="text-sm text-muted">{p.subject}</span>}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      p.status === "approved"
                        ? "bg-green-100 text-green-800"
                        : p.status === "pending"
                          ? "bg-amber-100 text-amber-900"
                          : p.status === "rejected"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-page text-muted"
                    }`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                  <span className="text-xs text-muted">내가 풀기: {solvedText(p)}</span>
                  <span className="ml-auto flex gap-1.5">
                    <button type="button" onClick={() => setView({ kind: "solve", id: p.id })} className="rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-page">
                      풀기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMessage(null);
                        setView({ kind: "edit", id: p.id });
                      }}
                      className="rounded-lg border border-line px-2.5 py-1 text-sm hover:bg-page"
                    >
                      고치기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!quietConfirm(`"${p.title}" 문제를 지울까요? 친구들이 푼 기록도 함께 지워져요.`)) return;
                        deleteMyProblem(p.id).then((r) => (r.ok ? reload() : setMessage(r.error ?? "지우지 못했어요.")));
                      }}
                      className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:text-danger"
                    >
                      지우기
                    </button>
                  </span>
                </div>
                {p.status === "rejected" && p.reviewNote && (
                  <p className="rounded bg-rose-50 px-3 py-1.5 text-sm text-rose-900">💬 선생님: {p.reviewNote}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">아직 만든 문제가 없어요.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-bold">👥 우리 반 친구가 만든 문제 ({data.classmates.length})</h3>
        <p className="-mt-1 text-xs text-muted">선생님이 확인한 문제만 보여요. 만든 친구의 이름과 답은 보이지 않아요.</p>
        {data.classmates.length ? (
          <ul className="flex flex-col gap-2">
            {data.classmates.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setView({ kind: "solve", id: p.id })}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-white px-4 py-3 text-left hover:border-brand"
                >
                  <span className="font-bold">{p.title}</span>
                  {subjects.length > 1 && <span className="text-sm text-muted">{p.subject}</span>}
                  <span className="ml-auto text-xs font-bold text-muted">{solvedText(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">아직 공개된 친구 문제가 없어요.</p>
        )}
      </section>
    </div>
  );
}

type TestDraft = { inputs: string; output: string };

/** 문제 만들기·고치기: 문제 → 예시 → 내 답(기록 편집기) → 공개 범위 → 내 답으로 확인하고 저장 */
function ProblemEditor({
  userId,
  subjects,
  id,
  onDone,
  onCancel,
}: {
  userId: string;
  subjects: string[];
  id?: number;
  onDone: (message: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [subject, setSubject] = useState(subjects[0] ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [conditions, setConditions] = useState("");
  const [tests, setTests] = useState<TestDraft[]>([
    { inputs: "", output: "" },
    { inputs: "", output: "" },
  ]);
  const [starterCode, setStarterCode] = useState("");
  const [share, setShare] = useState<Share>("private");
  const [ready, setReady] = useState(id === undefined);
  const [outcomes, setOutcomes] = useState<TestOutcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const recorder = useRef<RecorderHandle>(null);
  // 내 답을 쓰는 과정도 기록한다 (선생님이 승인할 때 재생해 볼 수 있음)
  const answerKey = storageKeyFor(userId, "내문제", id === undefined ? "S-new" : `${studentProblemKey(id)}-answer`);

  useEffect(() => {
    if (id === undefined) return;
    let alive = true;
    loadMyProblemForEdit(id).then((r) => {
      if (!alive) return;
      if (!r.ok) return setError(r.error);
      const p = r.problem;
      setSubject(p.subject);
      setTitle(p.title);
      setDescription(p.description);
      setConditions(p.conditions.join("\n"));
      setTests(p.tests.map((t) => ({ inputs: t.inputs.join("\n"), output: t.output })));
      setStarterCode(p.starterCode);
      setShare(p.share);
      try {
        if (localStorage.getItem(answerKey) === null) {
          localStorage.setItem(answerKey, JSON.stringify({ init: r.solutionInit, log: Array.isArray(r.solutionLog) ? r.solutionLog : [], code: p.solution }));
        }
      } catch {}
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [id, answerKey]);

  const toInput = (solution: string): StudentProblemInput => ({
    subject,
    title,
    description,
    conditions: conditions.split("\n").map((c) => c.trim()).filter(Boolean),
    starterCode,
    tests: tests.map((t) => ({ inputs: inputLines(t.inputs), output: t.output })),
    solution,
    share,
  });

  function checkAndSave() {
    const rec = recorder.current?.getRecording();
    if (!rec) return;
    setError(null);
    if (!title.trim() || !description.trim()) return setError("제목과 문제 설명을 써 주세요.");
    if (tests.some((t) => !t.output.trim())) return setError("예시마다 기대 출력을 써 주세요.");
    if (!rec.code.trim()) return setError("내 답 코드를 써 주세요.");
    startTransition(async () => {
      const input = toInput(rec.code);
      try {
        const judged = judge(input.tests, await runTests(rec.code, input.tests));
        setOutcomes(judged);
        const firstError = judged.find((o) => o.error)?.error;
        recorder.current?.addMark(firstError ? `r:${firstError.split(":")[0]}` : "r:ok");
        if (!judged.every((o) => o.pass)) {
          return setError("내 답이 예시를 모두 통과해야 저장할 수 있어요. 예시의 기대 출력이나 내 답을 고쳐 보세요.");
        }
        const after = recorder.current?.getRecording() ?? rec;
        const r = await saveMyProblem(input, { init: after.init, log: after.log }, id);
        if (!r.ok) return setError(r.error);
        try {
          if (id === undefined) localStorage.removeItem(answerKey);
        } catch {}
        await onDone(
          share === "class"
            ? `"${title}" 문제를 저장했어요. 선생님이 확인하면 우리 반 친구들이 풀 수 있어요.`
            : `"${title}" 문제를 저장했어요. 나만 볼 수 있어요.`,
        );
      } catch (err) {
        setError(String((err as Error)?.message ?? err));
      }
    });
  }

  if (!ready) return <p className="text-muted">{error ?? "불러오는 중…"}</p>;

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onCancel} className="self-start text-sm font-bold text-brand hover:underline">
        ← 직접 만든 문제 목록
      </button>
      <h3 className="text-xl font-black">{id === undefined ? "✏️ 새 문제 만들기" : "✏️ 문제 고치기"}</h3>
      {id !== undefined && share === "class" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">고쳐서 저장하면 선생님이 다시 확인한 뒤에 친구들에게 보여요.</p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <h4 className="font-bold">1. 문제</h4>
          {subjects.length > 1 && (
            <label className="flex flex-col gap-1 text-sm text-muted">
              과목
              <select value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass}>
                {subjects.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm text-muted">
            제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE} placeholder="예: 우리 반 간식 나누기" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            문제 설명 (무엇을 입력받아 무엇을 출력하는지, 출력 모양까지)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={MAX_DESCRIPTION} rows={5} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            조건 (선택, 한 줄에 하나, {MAX_CONDITIONS}개까지)
            <textarea value={conditions} onChange={(e) => setConditions(e.target.value)} rows={3} placeholder={"예: for 반복문을 쓸 것"} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            시작 코드 (선택, 친구가 처음 보는 코드)
            <textarea value={starterCode} onChange={(e) => setStarterCode(e.target.value)} rows={2} spellCheck={false} className={`${inputClass} font-mono text-sm`} />
          </label>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <h4 className="font-bold">2. 예시 ({MIN_TESTS}~{MAX_TESTS}개)</h4>
          <p className="-mt-2 text-xs text-muted">입력은 input()에 들어갈 값을 한 줄에 하나씩 써요. 입력이 없으면 비워 두세요.</p>
          {tests.map((t, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted">
                예시 {i + 1} 입력
                <textarea
                  value={t.inputs}
                  onChange={(e) => setTests((list) => list.map((x, j) => (j === i ? { ...x, inputs: e.target.value } : x)))}
                  rows={3}
                  className={`${inputClass} font-mono text-sm`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                기대 출력
                <textarea
                  value={t.output}
                  onChange={(e) => setTests((list) => list.map((x, j) => (j === i ? { ...x, output: e.target.value } : x)))}
                  rows={3}
                  className={`${inputClass} font-mono text-sm`}
                />
              </label>
              {tests.length > MIN_TESTS && (
                <button
                  type="button"
                  onClick={() => setTests((list) => list.filter((_, j) => j !== i))}
                  className="justify-self-start text-xs text-muted hover:text-danger sm:col-span-2"
                >
                  이 예시 빼기
                </button>
              )}
            </div>
          ))}
          {tests.length < MAX_TESTS && (
            <button
              type="button"
              onClick={() => setTests((list) => [...list, { inputs: "", output: "" }])}
              className="self-start rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-page"
            >
              + 예시 더하기
            </button>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <h4 className="font-bold">3. 내 답</h4>
        <p className="-mt-2 text-xs text-muted">이 코드로 예시를 모두 통과해야 저장돼요. 친구에게는 보이지 않고, 선생님은 볼 수 있어요.</p>
        <RecordingEditor ref={recorder} storageKey={answerKey} />
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-5">
        <h4 className="font-bold">4. 누가 풀까요?</h4>
        <label className="flex items-start gap-2">
          <input type="radio" name="share" checked={share === "private"} onChange={() => setShare("private")} className="mt-1.5" />
          <span>
            <b>🔒 나만 풀기</b>
            <span className="block text-sm text-muted">나만 보고 풀어요. 선생님은 볼 수 있어요.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="share" checked={share === "class"} onChange={() => setShare("class")} className="mt-1.5" />
          <span>
            <b>👥 선생님 승인 후 우리 반 친구와 풀기</b>
            <span className="block text-sm text-muted">선생님이 확인하면 같은 반 친구들이 풀 수 있어요. 친구에게 내 이름과 답은 보이지 않아요.</span>
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={checkAndSave}
          disabled={pending}
          className="rounded-xl bg-gradient-to-br from-brand to-violet-600 px-6 py-2.5 font-bold text-white disabled:opacity-60"
        >
          {pending ? "확인하는 중…" : "✅ 내 답으로 확인하고 저장"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      {outcomes && <Outcomes tests={toInput("").tests} outcomes={outcomes} />}
    </div>
  );
}
