import { Suspense } from "react";
import Header from "@/components/Header";
import { requireRole } from "@/lib/session";
import SideTabs from "@/components/SideTabs";
import { listAllProblems } from "@/lib/problemStore";
import { listReflectionDays } from "@/lib/reflectionStore";
import { getTeacherHome } from "@/lib/teacherHome";
import TeacherDashboard from "./TeacherDashboard";
import { listStudents } from "@/lib/teacher";
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
                <p className="text-sm text-muted">
                  채점·제출 관리는 3단계에서 만들어요. 그동안은 기존(v1) 교사 화면을 써 주세요.
                </p>
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
    />
  );
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
