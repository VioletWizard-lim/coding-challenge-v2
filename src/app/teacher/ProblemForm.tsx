"use client";

import { useEffect, useState, useTransition } from "react";
import ProblemView from "@/components/ProblemView";
import {
  labelOf,
  MAX_EXAMPLES,
  NUMBER_PATTERN,
  type Example,
  type Problem,
} from "@/lib/problemBank";
import {
  LESSON_STANDARDS,
  lessonDefaults,
  LEVELS,
  MAX_LESSON,
  MAX_LESSON_ORDER,
  STANDARDS,
  standardLabel,
  type Level,
} from "@/lib/standards";
import {
  deleteProblemAction,
  saveProblemAction,
  type ProblemResult,
} from "./actions";

export const inputClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

type OpenMode = "now" | "at" | "hidden";

/** ISO 시각 → <input type="datetime-local"> 값 (이 컴퓨터의 시간대 = 한국 시간) */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 문제 한 개 고치기·새로 만들기 양식 (왼쪽 입력, 오른쪽 학생 화면 미리보기).
 * onDraft가 있으면 DB에 저장하지 않고 고친 문제를 돌려준다 (학습지 업로드 미리보기에서 반영 전에 고치기). 이때 공개 칸·지우기는 없다.
 */
export default function ProblemForm({
  problem,
  now,
  onDone,
  onCancel,
  onDirtyChange,
  onDraft,
  siblings = [],
  lessonReady = true,
}: {
  problem: Problem;
  /** 같은 과목의 다른 문제들 (차시 안 순서로 기본/심화·앵커를 미리 채울 때) */
  siblings?: Problem[];
  /** 성취기준·차시 칸(025)이 DB에 있는지 */
  lessonReady?: boolean;
  now: Date;
  onDone?: (r: ProblemResult) => void;
  /** 저장하지 않고 고친 문제를 돌려받는다 (학습지 업로드 미리보기) */
  onDraft?: (p: Problem) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const alreadyOpen =
    problem.openAt !== null && new Date(problem.openAt) <= now;
  const [number, setNumber] = useState(problem.number);
  const [title, setTitle] = useState(
    problem.title === problem.number ? "" : problem.title,
  );
  const [difficulty, setDifficulty] = useState<number | null>(
    problem.difficulty,
  );
  const [description, setDescription] = useState(problem.description);
  const [conditions, setConditions] = useState(problem.conditions);
  const [examples, setExamples] = useState<Example[]>(
    problem.examples.length ? problem.examples : [{ input: "", output: "" }],
  );
  const [goal, setGoal] = useState(problem.goal);
  const [challenge, setChallenge] = useState(problem.challenge);
  const [starterCode, setStarterCode] = useState(problem.starterCode);
  const [mode, setMode] = useState<OpenMode>(
    problem.openAt === null ? "hidden" : alreadyOpen ? "now" : "at",
  );
  const [openAtLocal, setOpenAtLocal] = useState(
    problem.openAt && !alreadyOpen ? toLocalInput(problem.openAt) : "",
  );
  // 수업 계획 (025): 차시·순서를 넣으면 성취기준·기본/심화·앵커가 미리 채워진다 (고칠 수 있음)
  const [lesson, setLesson] = useState(problem.lesson ? String(problem.lesson) : "");
  const [lessonOrder, setLessonOrder] = useState(problem.lessonOrder ? String(problem.lessonOrder) : "");
  const [level, setLevel] = useState<Level | null>(problem.level ?? null);
  const [anchor, setAnchor] = useState(!!problem.anchor);
  const [standards, setStandards] = useState<string[]>(problem.standards ?? []);
  // 선택 칸: 이미 값이 있으면 처음부터 펼쳐 둔다 (고칠 때 찾느라 헤매지 않게)
  const [more, setMore] = useState(
    () =>
      problem.difficulty !== null ||
      !!problem.conditions.trim() ||
      !!problem.goal.trim() ||
      !!problem.challenge.trim() ||
      !!problem.starterCode.trim() ||
      !!problem.lesson ||
      !!problem.level ||
      !!problem.anchor ||
      !!problem.standards?.length,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lessonNum = /^\d+$/.test(lesson) ? Number(lesson) : null;
  const orderNum = /^\d+$/.test(lessonOrder) ? Number(lessonOrder) : null;
  const sameLesson = siblings.filter(
    (q) => q.subject === problem.subject && q.id !== problem.id && lessonNum !== null && q.lesson === lessonNum,
  );
  const otherAnchors = anchor ? sameLesson.filter((q) => q.anchor) : [];

  /** 차시·순서를 바꾸면 미리 채우기 */
  function prefill(nextLesson: string, nextOrder: string) {
    const l = /^\d+$/.test(nextLesson) ? Number(nextLesson) : null;
    const o = /^\d+$/.test(nextOrder) ? Number(nextOrder) : null;
    if (l === null) return;
    if (o === null) {
      setStandards(LESSON_STANDARDS[l] ?? []);
      return;
    }
    const orders = siblings
      .filter((q) => q.subject === problem.subject && q.id !== problem.id && q.lesson === l && q.lessonOrder)
      .map((q) => q.lessonOrder!);
    const d = lessonDefaults(l, o, orders);
    setStandards(d.standards);
    setLevel(d.level);
    setAnchor(d.anchor);
  }

  // 처음 값에서 바뀐 칸이 있는지 (번호는 추천 값이라, 다르게 고쳤을 때만)
  const dirty =
    number.trim() !== problem.number ||
    title.trim() !==
      (problem.title === problem.number ? "" : problem.title).trim() ||
    description !== problem.description ||
    conditions !== problem.conditions ||
    goal !== problem.goal ||
    challenge !== problem.challenge ||
    starterCode !== problem.starterCode ||
    difficulty !== problem.difficulty ||
    examples.some(
      (e, i) =>
        e.input !== (problem.examples[i]?.input ?? "") ||
        e.output !== (problem.examples[i]?.output ?? ""),
    ) ||
    openAtLocal !==
      (problem.openAt && !alreadyOpen ? toLocalInput(problem.openAt) : "") ||
    lesson !== (problem.lesson ? String(problem.lesson) : "") ||
    lessonOrder !== (problem.lessonOrder ? String(problem.lessonOrder) : "") ||
    level !== (problem.level ?? null) ||
    anchor !== !!problem.anchor ||
    standards.join() !== (problem.standards ?? []).join();
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function save() {
    if (!NUMBER_PATTERN.test(number.trim()))
      return setError("번호는 '2-3'처럼 단원-번호로 적어 주세요.");
    if (!title.trim()) return setError("제목을 적어 주세요.");
    if (lesson.trim() && (lessonNum === null || lessonNum < 1 || lessonNum > MAX_LESSON))
      return setError(`차시는 1~${MAX_LESSON} 사이 숫자로 적어 주세요.`);
    if (lessonOrder.trim() && (orderNum === null || orderNum < 1 || orderNum > MAX_LESSON_ORDER))
      return setError(`차시 안 순서는 1~${MAX_LESSON_ORDER} 사이 숫자로 적어 주세요.`);
    if (onDraft) {
      setError(null);
      return onDraft({
        ...problem,
        number: number.trim(),
        title: title.trim() || number.trim(),
        difficulty,
        description,
        conditions,
        examples: examples.filter((e) => e.input.trim() || e.output.trim()),
        goal,
        challenge,
        starterCode,
      });
    }
    if (mode === "at" && !openAtLocal)
      return setError("공개할 날짜와 시각을 고르세요.");
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
        ...(lessonReady
          ? { lesson: lessonNum, lessonOrder: orderNum, level, anchor, standards }
          : {}),
      });
      if (r.ok) onDone?.(r);
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
    startTransition(async () =>
      onDone?.(await deleteProblemAction(problem.id!)),
    );
  }

  /** "더 적기"에 든 칸들과 채웠는지 (접혀 있어도 무엇을 적었는지 보이게) */
  const optionalFields: [string, boolean][] = [
    ["난이도", difficulty !== null],
    ["조건", !!conditions.trim()],
    ["문제 목표", !!goal.trim()],
    ["도전 과제", !!challenge.trim()],
    ["시작 코드", !!starterCode.trim()],
    ...(onDraft ? [] : ([["수업 계획(차시·성취기준)", !!lesson || !!lessonOrder || !!level || anchor || standards.length > 0]] as [string, boolean][])),
  ];

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
          {onDraft
            ? `반영 전에 고치기: ${problem.subject} ${labelOf(problem)}`
            : problem.id === null
              ? `새 문제 (${problem.subject})`
              : `고치기: ${problem.subject} ${labelOf(problem)}`}
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
        <fieldset className="flex flex-col gap-2 text-sm text-muted">
          <legend className="mb-1">
            예시 (입력값이 여러 개면 &lsquo;길동 / 돈까스 / 볶음밥 /
            된장국&rsquo;처럼, 입력이 없는 문제는 비워 두세요)
          </legend>
          {examples.map((ex, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-lg border border-line bg-white p-2 sm:grid-cols-[1fr_1fr_auto]"
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs">예시 {i + 1} 입력</span>
                <textarea
                  value={ex.input}
                  onChange={(e) =>
                    setExamples(
                      examples.map((x, j) =>
                        j === i ? { ...x, input: e.target.value } : x,
                      ),
                    )
                  }
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
                    setExamples(
                      examples.map((x, j) =>
                        j === i ? { ...x, output: e.target.value } : x,
                      ),
                    )
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
              onClick={() =>
                setExamples([...examples, { input: "", output: "" }])
              }
              className="self-start rounded-lg border border-line bg-white px-3 py-1 text-sm"
            >
              ＋ 예시 추가
            </button>
          )}
        </fieldset>
        {/* 꼭 필요한 칸(번호·제목·문제·예시·공개)만 먼저 보이고, 나머지는 "더 적기"를 눌러 연다. 값이 있으면 처음부터 열림 */}
        <div className={`flex flex-col gap-3 rounded-xl border-2 p-3 ${more ? "border-brand/40 bg-white" : "border-dashed border-brand/50 bg-brand-soft/50"}`}>
        <button
          type="button"
          onClick={() => setMore(!more)}
          aria-expanded={more}
          className="flex flex-col gap-2 text-left"
        >
          <span className="flex w-full items-center gap-2">
            <span className="font-bold text-brand">{more ? "➖" : "➕"} 더 적기 (선택)</span>
            <span className="text-xs text-muted">필요한 것만 적으면 돼요</span>
            <span className="ml-auto rounded-lg bg-brand px-3 py-1 text-sm font-bold text-white">{more ? "접기 ▲" : "펼치기 ▼"}</span>
          </span>
          <span className="flex flex-wrap gap-1.5">
            {optionalFields.map(([name, filled]) => (
              <span
                key={name}
                className={`rounded-full border px-2 py-0.5 text-xs ${filled ? "border-green-300 bg-green-50 font-bold text-green-800" : "border-line bg-white text-muted"}`}
              >
                {filled ? "✓ " : ""}
                {name}
              </span>
            ))}
          </span>
        </button>
        {more && (
          <div className="flex flex-col gap-3 border-t border-line pt-3">
        <div className="flex flex-col gap-1 text-sm text-muted">
          난이도
          <div
            className="flex items-center gap-1"
            role="radiogroup"
            aria-label="난이도"
          >
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
              {difficulty ? `별 ${difficulty}개` : "정하지 않음"} (같은 별을
              다시 누르면 지워져요)
            </span>
          </div>
        </div>
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
            placeholder={
              "money = int(input())\n# 여기에 코드를 이어서 작성하세요"
            }
            className={`${inputClass} font-[family-name:var(--font-code)] text-sm`}
          />
        </label>
        {!onDraft && (
          <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-white p-3 text-sm">
            <legend className="px-1 text-muted">
              수업 계획 (선택, 연구용 지표를 차시·성취기준별로 나눠 볼 때 써요)
            </legend>
            {!lessonReady && (
              <p className="text-xs text-amber-800">
                아직 저장되지 않아요. Supabase에서 025_problem_lessons.sql을
                실행해 주세요.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-muted">
                차시
                <input
                  value={lesson}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setLesson(v);
                    prefill(v, lessonOrder);
                  }}
                  inputMode="numeric"
                  placeholder="2"
                  className={`${inputClass} w-20 font-mono`}
                />
              </label>
              <label className="flex flex-col gap-1 text-muted">
                차시 안 순서
                <input
                  value={lessonOrder}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setLessonOrder(v);
                    prefill(lesson, v);
                  }}
                  inputMode="numeric"
                  placeholder="1"
                  className={`${inputClass} w-24 font-mono`}
                />
              </label>
              <div className="flex flex-col gap-1 text-muted">
                기본/심화
                <div className="flex gap-1" role="radiogroup" aria-label="기본/심화">
                  {LEVELS.map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      role="radio"
                      aria-checked={level === lv}
                      onClick={() => setLevel(level === lv ? null : lv)}
                      className={`rounded-lg border px-3 py-2 ${level === lv ? "border-brand bg-brand-soft font-bold text-brand" : "border-line bg-white text-ink"}`}
                    >
                      {lv}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 pb-2 text-ink">
                <input
                  type="checkbox"
                  checked={anchor}
                  onChange={(e) => setAnchor(e.target.checked)}
                />
                앵커(기준 문제)
              </label>
            </div>
            <p className="text-xs text-muted">
              차시와 순서를 넣으면 성취기준·기본/심화·앵커가 미리 채워져요
              (3문제 이하면 1번만 기본, 4문제 이상이면 1·2번이 기본, 마지막
              문제가 앵커). 문제마다 고칠 수 있어요.
            </p>
            {otherAnchors.length > 0 && (
              <p className="text-xs text-amber-800">
                이 차시에 앵커가 또 있어요:{" "}
                {otherAnchors.map((q) => q.number).join(", ")}. 차시마다 하나만
                두는 것을 권해요.
              </p>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-muted">성취기준 [12정03] 프로그래밍</span>
              {[true, false].map((main) => (
                <div key={String(main)} className="flex flex-wrap gap-x-4 gap-y-1">
                  <span className="w-full text-xs text-muted">
                    {main ? "주 성취기준" : "확장용"}
                  </span>
                  {STANDARDS.filter((s) => s.main === main).map((s) => (
                    <label
                      key={s.code}
                      className="flex items-center gap-1 text-ink"
                      title={s.text}
                    >
                      <input
                        type="checkbox"
                        checked={standards.includes(s.code)}
                        onChange={(e) =>
                          setStandards(
                            e.target.checked
                              ? [...standards, s.code].sort()
                              : standards.filter((c) => c !== s.code),
                          )
                        }
                      />
                      {standardLabel(s.code)}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </fieldset>
        )}
          </div>
        )}
        </div>
        {!onDraft && (
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1 text-muted">공개</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "now"}
                onChange={() => setMode("now")}
              />
              {alreadyOpen ? "공개 중 (그대로 두기)" : "저장하면 바로 공개"}
            </label>
            <label className="flex flex-wrap items-center gap-2">
              <input
                type="radio"
                checked={mode === "at"}
                onChange={() => setMode("at")}
              />
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
              <input
                type="radio"
                checked={mode === "hidden"}
                onChange={() => setMode("hidden")}
              />
              비공개 (학생에게 안 보임)
            </label>
          </fieldset>
        )}
        {problem.id !== null &&
          !onDraft &&
          problem.number !== number.trim() && (
            <p className="text-xs text-amber-800">
              번호를 바꾸면 학생 화면에서 다른 문제가 돼요. 이미 낸 제출은 옛
              번호로 남아요.
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
            {onDraft ? "미리보기에 반영" : pending ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line bg-white px-4 py-2"
          >
            취소
          </button>
          {problem.id !== null && !onDraft && (
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
          <ProblemView problem={preview} fit />
        </div>
      </aside>
    </div>
  );
}
