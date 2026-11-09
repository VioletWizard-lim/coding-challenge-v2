"use client";

import type { ReactNode } from "react";
import { useStudentNav } from "@/components/SideTabs";
import type { TeacherHomeData } from "@/lib/teacherHome";
import { GRADE_SUBJECT_EVENT } from "./GradingBoard";

const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", month: "long", day: "numeric", weekday: "short" });
const openFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 교사 첫 화면: 오늘 수업 현황, 오늘 많이 푼 문제, 채점 대기, 문제 공개 일정, 바로 가기 */
export default function TeacherDashboard({
  name,
  data,
  status,
  aiUsage,
}: {
  name: string;
  /** studentPending: 승인 기다리는 학생이 만든 문제 수 */
  data: TeacherHomeData & { studentPending?: number };
  status?: ReactNode;
  /** AI 도우미 사용량 카드 (서버에서 따로 불러옴) */
  aiUsage?: ReactNode;
}) {
  const { showTab, problemLabel } = useStudentNav();
  const subjects = [...new Set(data.classes.map((c) => c.subject))];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-2xl font-black">{name}님, 안녕하세요! 👋</h2>
          <p className="text-muted">{dayFormat.format(new Date(`${data.today}T00:00:00Z`))} · 오늘 수업을 한눈에 봐요.</p>
        </div>
        {/* 바로 가기: 작게 만들어 보통 한 줄에 들어가게. 안 들어가면 스크롤 막대 없이 다음 줄로 */}
        <div className="flex flex-wrap gap-1.5">
        {[
          // 왼쪽 메뉴와 같은 순서
          ["📚 문제 관리", "problems"],
          ["✏️ 학생이 만든 문제", "student-problems"],
          ["📝 채점", "grading"],
          ["📊 반별 현황", "stats"],
          ["🧭 학생별 학습 여정", "journey"],
          ["💭 성찰 모아보기", "reflections"],
          ["🤖 AI 대화", "ai"],
        ].map(([label, tab]) => (
          <button
            key={tab}
            type="button"
            onClick={() => showTab(tab)}
            className="whitespace-nowrap rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-bold hover:border-brand hover:text-brand"
          >
            {label} →
            {tab === "student-problems" && !!data.studentPending && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900" title="학생이 만든 문제 중 승인 기다리는 것">
                승인 {data.studentPending}
              </span>
            )}
          </button>
        ))}
          <a
            href="/guide"
            target="_blank"
            className="whitespace-nowrap rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-muted hover:border-brand hover:text-brand"
          >
            📖 사용 안내
          </a>
        </div>
      </div>

      {status}

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 className="font-bold">📊 오늘 수업 현황</h3>
          <p className="text-sm text-muted">오늘 제출 {data.totalToday}건 · 반은 제출할 때의 반(프로그래밍은 프로그래밍 반)</p>
        </div>
        {data.classes.length ? (
          subjects.map((subject) => (
            <div key={subject} className="flex flex-col gap-2">
              {subjects.length > 1 && <p className="text-sm font-bold text-muted">{subject}</p>}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.classes
                  .filter((c) => c.subject === subject)
                  .map((c) => (
                    <div key={c.cls} className="rounded-lg bg-page px-4 py-3">
                      <p className="font-bold">{c.cls === "반 없음" ? c.cls : `${c.cls}반`}</p>
                      <p className="text-sm">
                        제출한 학생 <b>{c.students}명</b> · 제출 <b>{c.submissions}건</b>
                      </p>
                      <p className="text-sm text-muted">💭 성찰 쓴 학생 {c.reflected}명</p>
                    </div>
                  ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">오늘은 아직 제출이 없어요.</p>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <h3 className="font-bold">🔥 오늘 많이 푼 문제</h3>
          {data.problems.length ? (
            <ul className="flex flex-col gap-1.5">
              {data.problems.map((p) => (
                <li key={`${p.subject}_${p.problem}`} className="flex items-center gap-2 text-sm">
                  {subjects.length > 1 && <span className="text-muted">{p.subject}</span>}
                  <span className="font-bold">{problemLabel(p.subject, p.problem)}</span>
                  <span className="ml-auto text-muted">{p.students}명</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">아직 없어요.</p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <h3 className="font-bold">📝 채점 대기</h3>
          <p>
            <b className="text-2xl text-brand">{data.pending}</b>건
            <span className="ml-2 text-sm text-muted">점수도 오답 처리도 안 된 제출 (모든 과목)</span>
          </p>
          {data.pendingBySubject.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {data.pendingBySubject.map((p) => (
                <li key={p.subject}>
                  <button
                    type="button"
                    onClick={() => {
                      showTab("grading");
                      window.dispatchEvent(new CustomEvent(GRADE_SUBJECT_EVENT, { detail: p.subject }));
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-page"
                  >
                    <span className="font-bold">{p.subject}</span>
                    <span className="text-muted">{p.count}건</span>
                    <span className="ml-auto font-bold text-brand">채점하러 가기 →</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">채점할 제출이 없어요. 🎉</p>
          )}
        </section>

        {aiUsage}
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 className="font-bold">🗓 문제 공개 일정</h3>
          <button type="button" onClick={() => showTab("problems")} className="ml-auto text-sm font-bold text-brand hover:underline">
            문제 관리 →
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ProblemList title="곧 공개" empty="예약된 문제가 없어요." items={data.upcoming} tone="text-amber-700" label={problemLabel} />
          <ProblemList title="최근 7일 공개" empty="최근 공개한 문제가 없어요." items={data.recentlyOpened} tone="text-green-700" label={problemLabel} />
        </div>
      </section>
    </div>
  );
}

function ProblemList({
  title,
  empty,
  items,
  tone,
  label,
}: {
  title: string;
  empty: string;
  items: TeacherHomeData["upcoming"];
  tone: string;
  label: (subject: string, number: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-bold text-muted">{title}</p>
      {items.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((p) => (
            <li key={`${p.subject}_${p.number}`} className="flex gap-2">
              <span className={`shrink-0 tabular-nums ${tone}`}>{openFormat.format(new Date(p.openAt))}</span>
              <span className="min-w-0 truncate">
                {p.subject} {label(p.subject, p.number)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}
