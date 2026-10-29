import { Suspense } from "react";
import Header from "@/components/Header";
import { requireRole } from "@/lib/session";
import SideTabs from "@/components/SideTabs";
import { listAllProblems } from "@/lib/problemStore";
import { listStudents } from "@/lib/teacher";
import HealthCard from "./HealthCard";
import { kstDate } from "@/lib/journey";
import { SUBJECTS } from "@/lib/problems";
import ProblemManager from "./ProblemManager";
import ReflectionBoard from "./ReflectionBoard";
import StudentImport from "./StudentImport";
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
  return (
    <>
      <Header name={session.name} role="teacher" />
      <SideTabs
        tabs={[
          {
            id: "students",
            label: "🏫 학생 관리",
            content: (
              <div className="mx-auto flex max-w-5xl flex-col gap-6">
                <Suspense fallback={<p className="text-muted">상태 확인 중…</p>}>
                  <HealthCard />
                </Suspense>
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
  let students, problems;
  try {
    [students, { problems }] = await Promise.all([listStudents(), listAllProblems()]);
  } catch (err) {
    console.error(err);
    return <p className="text-danger">학생 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  const titles: Record<string, string> = {};
  for (const p of problems) titles[`${p.subject}_${p.number}`] = p.title;
  return (
    <ReflectionBoard students={students} subjects={Object.keys(SUBJECTS)} today={kstDate(new Date())} titles={titles} />
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
