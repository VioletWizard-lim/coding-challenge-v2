"use client";

import type { ReactNode } from "react";
import { useStudentNav } from "@/components/SideTabs";
import type { TeacherHomeData } from "@/lib/teacherHome";

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
export default function TeacherDashboard({ name, data, status }: { name: string; data: TeacherHomeData; status?: ReactNode }) {
  const { showTab, problemLabel } = useStudentNav();
  const subjects = [...new Set(data.classes.map((c) => c.subject))];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-2xl font-black">{name}님, 안녕하세요! 👋</h2>
          <p className="text-muted">{dayFormat.format(new Date(`${data.today}T00:00:00Z`))} · 오늘 수업을 한눈에 봐요.</p>
        </div>
        {[
          ["📚 문제 관리", "problems"],
          ["🧭 학생별 학습 여정", "journey"],
          ["💭 성찰 모아보기", "reflections"],
        ].map(([label, tab]) => (
          <button
            key={tab}
            type="button"
            onClick={() => showTab(tab)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold hover:border-brand hover:text-brand"
          >
            {label} →
          </button>
        ))}
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

      <div className="grid gap-5 md:grid-cols-2">
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
            <span className="ml-2 text-sm text-muted">점수도 오답 처리도 안 된 제출</span>
          </p>
          <p className="text-xs text-muted">채점은 3단계에서 만들 때까지 기존(v1) 교사 화면에서 해 주세요.</p>
        </section>
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
