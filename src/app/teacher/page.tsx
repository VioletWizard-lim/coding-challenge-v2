import { Suspense } from "react";
import Header from "@/components/Header";
import { requireRole } from "@/lib/session";
import { listStudents } from "@/lib/teacher";
import HealthCard from "./HealthCard";
import StudentImport from "./StudentImport";
import StudentManager from "./StudentManager";

export default function TeacherPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
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
      <Suspense fallback={<p className="text-muted">상태 확인 중…</p>}>
        <HealthCard />
      </Suspense>
      <StudentImport />
      <Suspense fallback={<p className="text-muted">학생 목록 불러오는 중…</p>}>
        <Students />
      </Suspense>
      <p className="text-sm text-muted">채점·제출 관리는 3단계에서 만들어요. 그동안은 기존(v1) 교사 화면을 써 주세요.</p>
    </>
  );
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
