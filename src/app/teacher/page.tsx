import { Suspense } from "react";
import Header from "@/components/Header";
import { requireRole } from "@/lib/session";
import SideTabs from "@/components/SideTabs";
import { listAllProblems } from "@/lib/problemStore";
import { listReflectionDays } from "@/lib/reflectionStore";
import { getTeacherHome } from "@/lib/teacherHome";
import TeacherDashboard from "./TeacherDashboard";
import { listStudents } from "@/lib/teacher";
import AiChatBoard from "./AiChatBoard";
import GradingBoard from "./GradingBoard";
import { compareNumber } from "@/lib/problemBank";
import AiUsageCard from "./AiUsageCard";
import HealthCard from "./HealthCard";
import { SUBJECTS } from "@/lib/problems";
import ProblemManager from "./ProblemManager";
import ReflectionBoard from "./ReflectionBoard";
import StudentImport from "./StudentImport";
import StudentJourney from "./StudentJourney";
import StudentManager from "./StudentManager";

export default function TeacherPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
        <TeacherHome />
      </Suspense>
    </main>
  );
}

async function TeacherHome() {
  const session = await requireRole("teacher");
  // 학습 여정·성찰에 보일 문제 이름: 원래 목록 + 교사가 올린 제목 (학생 화면과 같은 방식)
  const titles: Record<string, string> = {};
  for (const [subject, list] of Object.entries(SUBJECTS)) {
    for (const [number, title] of Object.entries(list)) titles[`${subject}_${number}`] = title;
  }
  try {
    for (const p of (await listAllProblems()).problems) titles[`${p.subject}_${p.number}`] = p.title;
  } catch (err) {
    console.error(err);
  }
  return (
    <>
      <Header name={session.name} role="teacher" />
      <SideTabs
        rememberAs="teacher"
        titles={titles}
        tabs={[
          {
            id: "home",
            label: "🏠 처음 화면",
            content: (
              <div className="mx-auto max-w-5xl">
                <Suspense fallback={<p className="text-muted">오늘 수업 현황 불러오는 중…</p>}>
                  <Dashboard name={session.name} />
                </Suspense>
              </div>
            ),
          },
          {
            id: "students",
            label: "🏫 학생 관리",
            content: (
              <div className="mx-auto flex max-w-5xl flex-col gap-6">
                <StudentImport />
                <Suspense fallback={<p className="text-muted">학생 목록 불러오는 중…</p>}>
                  <Students />
                </Suspense>
              </div>
            ),
          },
          {
            id: "problems",
            label: "📚 문제 관리",
            content: (
              <div className="mx-auto max-w-5xl">
                <Suspense fallback={<p className="text-muted">문제 불러오는 중…</p>}>
                  <Problems />
                </Suspense>
              </div>
            ),
          },
          {
            id: "grading",
            label: "📝 채점",
            content: (
              <div className="mx-auto max-w-5xl">
                <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
                  <Grading />
                </Suspense>
              </div>
            ),
          },
          {
            id: "journey",
            label: "🧭 학생별 학습 여정",
            content: (
              <div className="mx-auto max-w-5xl">
                <Suspense fallback={<p className="text-muted">학생 목록 불러오는 중…</p>}>
                  <Journeys />
                </Suspense>
              </div>
            ),
          },
          {
            id: "reflections",
            label: "💭 성찰 모아보기",
            content: (
              <div className="mx-auto max-w-5xl">
                <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
                  <Reflections />
                </Suspense>
              </div>
            ),
          },
          {
            id: "ai",
            label: "🤖 AI 대화",
            content: (
              <div className="mx-auto max-w-5xl">
                <Suspense fallback={<p className="text-muted">학생 목록 불러오는 중…</p>}>
                  <AiChats />
                </Suspense>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

async function Reflections() {
  let students, problems, days;
  try {
    [students, { problems }, days] = await Promise.all([listStudents(), listAllProblems(), listReflectionDays()]);
  } catch (err) {
    console.error(err);
    return <p className="text-danger">학생 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  const titles: Record<string, string> = {};
  for (const p of problems) titles[`${p.subject}_${p.number}`] = p.title;
  return (
    <ReflectionBoard
      students={students}
      subjects={Object.keys(SUBJECTS)}
      ready={days.ready}
      days={days.days}
      titles={titles}
    />
  );
}

async function Problems() {
  let data;
  try {
    data = await listAllProblems();
  } catch (err) {
    console.error(err);
    return <p className="text-danger">문제 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return <ProblemManager {...data} />;
}

async function Dashboard({ name }: { name: string }) {
  let data;
  try {
    const [{ problems }, days] = await Promise.all([listAllProblems(), listReflectionDays()]);
    data = await getTeacherHome(problems, days.days);
  } catch (err) {
    console.error(err);
    return <p className="text-danger">오늘 수업 현황을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return (
    <TeacherDashboard
      name={name}
      data={data}
      status={
        <Suspense fallback={<p className="text-muted">DB 연결 확인 중…</p>}>
          <HealthCard />
        </Suspense>
      }
      aiUsage={
        <Suspense fallback={null}>
          <AiUsageCard />
        </Suspense>
      }
    />
  );
}

async function Grading() {
  // 과목별 문제 번호: 원래 목록 + 교사가 올린 문제 (번호 순)
  const numbers: Record<string, Set<string>> = {};
  for (const [subject, list] of Object.entries(SUBJECTS)) numbers[subject] = new Set(Object.keys(list));
  try {
    for (const p of (await listAllProblems()).problems) (numbers[p.subject] ??= new Set()).add(p.number);
  } catch (err) {
    console.error(err);
  }
  const problems = Object.fromEntries(Object.entries(numbers).map(([s, set]) => [s, [...set].sort(compareNumber)]));
  return <GradingBoard subjects={Object.keys(SUBJECTS)} problems={problems} />;
}

async function AiChats() {
  let students;
  try {
    students = await listStudents();
  } catch (err) {
    console.error(err);
    return <p className="text-danger">학생 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return <AiChatBoard students={students} />;
}

async function Journeys() {
  let students;
  try {
    students = await listStudents();
  } catch (err) {
    console.error(err);
    return <p className="text-danger">학생 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return <StudentJourney students={students} />;
}

async function Students() {
  let students;
  try {
    students = await listStudents();
  } catch (err) {
    console.error(err);
    return <p className="text-danger">학생 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return <StudentManager students={students} />;
}
