"use client";

import AiHelperButton from "@/components/AiHelperButton";
import { useEffect, useRef, useState, useTransition } from "react";
import { useStudentNav } from "@/components/SideTabs";
import ProblemView from "@/components/ProblemView";
import RecordingEditor, { type RecorderHandle } from "@/components/RecordingEditor";
import { descriptionKeyFor, storageKeyFor } from "@/lib/editLog";
import { labelOf, type Problem } from "@/lib/problemBank";
import AiHelper from "./AiHelper";
import { checkSubmitted, submitCode } from "./actions";

const selectClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

const COOLDOWN_MS = 5000; // 같은 제출이 여러 번 들어가지 않게 (v1과 같음)

type Message = { text: string; kind: "ok" | "error" };

/** 이 창에서 고른 과목·문제 (화면이 새로 고쳐져도 같은 문제로) */
const PICK_KEY = "write:pick";
/** 제출 버튼을 누른 뒤 결과를 받기 전 (그 사이 화면이 새로 고쳐지면 저장됐는지 확인) */
const PENDING_KEY = "write:pending";
type Pending = { subject: string; problem: string; at: number; description: string; code: string };

const readSession = <T,>(key: string): T | null => {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const writeSession = (key: string, value: unknown) => {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

/** 과목·문제를 고르고, 기록 편집기에서 코드를 쓰고, 코드 설명과 함께 제출한다. 공개된 문제만 받는다. */
export default function Workspace({
  userId,
  subjects,
  problems: allProblems,
}: {
  userId: string;
  subjects: string[];
  problems: Problem[];
}) {
  const [subject, setSubject] = useState(subjects[0]);
  const problems = allProblems.filter((p) => p.subject === subject);
  const [problem, setProblem] = useState(problems[0]?.number ?? "");
  const current = problems.find((p) => p.number === problem) ?? problems[0];
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();
  const [coolingDown, setCoolingDown] = useState(false);
  const recorder = useRef<RecorderHandle>(null);
  const [aiOpen, setAiOpen] = useState(false);

  // 제출하지 않은 코드가 있으면 다른 탭으로 가거나 페이지를 떠날 때 알려 준다 (코드는 브라우저에 저장돼 있음)
  // 이동할 때마다 묻는다. 제출했거나, '다시 묻지 않기'를 고른 코드면 더 묻지 않는다 (고치면 다시 물음)
  const submittedCode = useRef<string | null>(null);
  const quietCode = useRef<string | null>(null);
  const unsentCode = () => {
    const rec = recorder.current?.getRecording();
    if (!rec || !rec.code.trim() || rec.code === rec.init || rec.code === submittedCode.current) return null;
    return rec.code;
  };
  const { writeTarget, setLeaveGuard } = useStudentNav();
  useEffect(() => {
    setLeaveGuard("write", () => {
      const code = unsentCode();
      if (code === null || code === quietCode.current) return null;
      return {
        message:
          "아직 제출하지 않은 코드가 있어요.\n코드는 이 브라우저에 저장돼서 돌아오면 그대로 있어요.\n다른 화면으로 이동할까요?",
        onLeave: (dontAskAgain) => {
          if (dontAskAgain) quietCode.current = code;
        },
      };
    });
    const onUnload = (e: BeforeUnloadEvent) => {
      if (unsentCode() === null) return;
      e.preventDefault();
      e.returnValue = ""; // 브라우저 기본 경고 창 (새로고침·창 닫기·로그아웃)
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      setLeaveGuard("write", null);
      window.removeEventListener("beforeunload", onUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번 등록 (ref로 최신 상태를 읽음)
  }, []);

  // 첫 화면에서 "코드 작성하러 가기"를 누르면 그 문제를 골라 둔다
  useEffect(() => {
    if (!writeTarget || !allProblems.some((p) => p.subject === writeTarget.subject && p.number === writeTarget.number)) return;
    /* eslint-disable react-hooks/set-state-in-effect -- 다른 탭에서 고른 문제를 받아 오는 것 */
    setSubject(writeTarget.subject);
    setProblem(writeTarget.number);
    setMessage(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새로 고를 때(n)만
  }, [writeTarget?.n]);

  // 처음 열 때: 화면이 새로 고쳐졌으면(새 버전 배포 등) 보던 문제로 돌아가고, 제출 중이었으면 저장됐는지 확인한다
  useEffect(() => {
    const pick = readSession<{ subject: string; problem: string }>(PICK_KEY);
    const pending = readSession<Pending>(PENDING_KEY);
    const target = pending ?? pick;
    /* eslint-disable react-hooks/set-state-in-effect -- 브라우저에만 있는 값을 처음 한 번 읽어 옴 */
    if (target && allProblems.some((p) => p.subject === target.subject && p.number === target.problem)) {
      setSubject(target.subject);
      setProblem(target.problem);
    }
    if (!pending) return;
    if (Date.now() - pending.at > 30 * 60_000) return writeSession(PENDING_KEY, null);
    setDescription(pending.description);
    setMessage({ text: "제출이 저장됐는지 확인하는 중…", kind: "ok" });
    /* eslint-enable react-hooks/set-state-in-effect */
    checkSubmitted(pending.subject, pending.problem, pending.at).then((saved) => {
      // 확인이 끝난 뒤에 지운다 (새로 고침이 두 번 이어져도 다시 확인할 수 있게)
      writeSession(PENDING_KEY, null);
      if (saved) {
        submittedCode.current = pending.code;
        setMessage({
          text: `✅ 제출 완료! (${pending.problem}) 제출하는 동안 화면이 새로 고쳐졌지만 제출은 저장됐어요.`,
          kind: "ok",
        });
      } else {
        setMessage({
          text: "제출하는 동안 화면이 새로 고쳐져서 제출되지 않았어요. 코드와 설명은 그대로 있으니 다시 제출해 주세요.",
          kind: "error",
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번만
  }, []);

  // 코드 설명은 문제마다 따로 둔다: 문제를 바꾸면 그 문제에 적어 둔 설명을 불러온다 (코드처럼 이 브라우저에 저장, 새로고침해도 유지)
  const descKey = current ? descriptionKeyFor(userId, subject, current.number) : null;
  useEffect(() => {
    let saved = "";
    try {
      saved = (descKey && localStorage.getItem(descKey)) || "";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저에만 있는 값을 문제가 바뀔 때 읽어 옴
    setDescription(saved);
  }, [descKey]);
  function changeDescription(text: string) {
    setDescription(text);
    if (!descKey) return;
    try {
      if (text) localStorage.setItem(descKey, text);
      else localStorage.removeItem(descKey);
    } catch {}
  }

  // 고른 문제를 이 창에 기억해 둔다 (위에서 먼저 읽은 뒤)
  useEffect(() => {
    if (current) writeSession(PICK_KEY, { subject, problem: current.number });
  }, [subject, current]);

  function changeSubject(next: string) {
    setSubject(next);
    setProblem(allProblems.find((p) => p.subject === next)?.number ?? "");
    setMessage(null);
  }

  function submit() {
    const rec = recorder.current?.getRecording();
    if (!rec || !current) return;
    if (!rec.code.trim()) return setMessage({ text: "코드를 입력하세요.", kind: "error" });
    if (!description.trim()) return setMessage({ text: "코드 설명을 입력하세요.", kind: "error" });
    setMessage(null);
    writeSession(PENDING_KEY, { subject, problem: current.number, at: Date.now(), description, code: rec.code } satisfies Pending);
    startTransition(async () => {
      const result = await submitCode({
        subject,
        problem: current.number,
        description,
        code: rec.code,
        init: rec.init,
        log: rec.log,
      });
      if (!result.ok) {
        writeSession(PENDING_KEY, null);
        return setMessage({ text: result.error, kind: "error" });
      }
      // 성공해도 바로 지우지 않는다: 새 버전이 배포된 직후면 답을 받자마자 화면이 새로 고쳐질 수 있어서,
      // 새로 고친 화면이 이 표시를 보고 "제출 완료"를 다시 보여 준다
      setTimeout(() => writeSession(PENDING_KEY, null), 5000);
      submittedCode.current = rec.code;
      setMessage({ text: `✅ 제출 완료! (${current.number}) '▶ 내 기록 다시 보기'에서 내가 쓴 과정을 돌아볼 수 있어요.`, kind: "ok" });
      setCoolingDown(true);
      setTimeout(() => setCoolingDown(false), COOLDOWN_MS);
    });
  }

  return (
    <section
      className={`grid gap-5 lg:grid-cols-[minmax(300px,2fr)_3fr] ${
        aiOpen && current ? "xl:grid-cols-[minmax(260px,1.5fr)_2.5fr_minmax(300px,1.6fr)]" : ""
      }`}
    >
      {/* 왼쪽: 문제 (나중에 교사가 올린 문제 설명이 이 자리에 나온다) */}
      <aside className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5 lg:sticky lg:top-20 lg:self-start">
        <div className="flex flex-wrap gap-3">
          {subjects.length > 1 && (
            <label className="flex flex-col gap-1 text-sm text-muted">
              과목
              <select value={subject} onChange={(e) => changeSubject(e.target.value)} className={selectClass}>
                {subjects.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm text-muted">
            문제
            <select
              value={current?.number ?? ""}
              onChange={(e) => {
                setProblem(e.target.value);
                setMessage(null);
              }}
              className={selectClass}
            >
              {problems.length === 0 && <option value="">공개된 문제 없음</option>}
              {problems.map((p) => (
                <option key={p.number} value={p.number}>
                  {labelOf(p)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {current ? (
          <ProblemView problem={current} />
        ) : (
          <div className="rounded-lg border border-dashed border-line bg-page p-4 text-sm leading-6 text-muted">
            아직 공개된 문제가 없어요. 선생님이 문제를 공개하면 여기에 나와요.
          </div>
        )}
        <p className="text-xs leading-5 text-muted">
          💾 작성 중인 코드와 과정은 이 브라우저에 자동 저장돼서 새로고침해도 그대로 있어요. 다 썼으면 코드 설명을
          적고 제출하세요.
        </p>
      </aside>

      {/* 오른쪽: 코드 작성 */}
      <div className="flex min-w-0 flex-col gap-4">
        {current && !aiOpen && <AiHelperButton onOpen={() => setAiOpen(true)} />}
        {current && (
          <RecordingEditor
            key={`${subject}_${current.number}`}
            ref={recorder}
            storageKey={storageKeyFor(userId, subject, current.number)}
            initialCode={current.starterCode}
          />
        )}
        <label className="flex flex-col gap-1 text-sm text-muted">
          코드 설명 (필수)
          <textarea
            value={description}
            onChange={(e) => changeDescription(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="내 코드가 어떻게 동작하는지, 어디를 고민했는지 적어 주세요."
            className="rounded-lg border border-line bg-white px-3 py-2 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={pending || coolingDown}
            className="rounded-xl bg-gradient-to-br from-brand to-violet-600 px-6 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "제출 중…" : "제출하기"}
          </button>
          {message && (
            <p
              role={message.kind === "error" ? "alert" : "status"}
              className={`text-sm ${message.kind === "error" ? "text-danger" : "text-green-700"}`}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>

      {/* 맨 오른쪽: 과정 기반 AI 도우미 (넓은 화면은 세 번째 칸, 좁으면 아래) */}
      {current && aiOpen && (
        <div className="min-w-0 lg:col-span-2 xl:col-span-1">
          <AiHelper
            key={`${subject}_${current.number}`}
            subject={subject}
            problem={current.number}
            recorder={recorder}
            onClose={() => setAiOpen(false)}
          />
        </div>
      )}
    </section>
  );
}
