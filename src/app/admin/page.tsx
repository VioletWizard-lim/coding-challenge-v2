import { Suspense } from "react";
import Header from "@/components/Header";
import { requireRole } from "@/lib/session";
import { listTeachers } from "@/lib/teacher";
import AiUsageCard from "../teacher/AiUsageCard";
import HealthCard from "../teacher/HealthCard";
import TeacherAccounts from "./TeacherAccounts";
import YearEndPanel from "./YearEndPanel";
import DeleteRequests from "./DeleteRequests";

/** 🛠 관리자 페이지: 관리자(role=admin) 계정만. 교사 계정 관리, 서비스 상태 */
export default function AdminPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
        <AdminHome />
      </Suspense>
    </main>
  );
}

async function AdminHome() {
  const session = await requireRole("admin");
  return (
    <>
      <Header name={session.name} role="admin" />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-black">🛠 관리자</h1>
          <p className="text-sm text-muted">교사 계정과 서비스 상태를 관리해요. 수업·채점은 교사 계정으로 해 주세요.</p>
        </div>
        <Suspense fallback={<p className="text-muted">교사 목록 불러오는 중…</p>}>
          <Teachers />
        </Suspense>
        <Suspense fallback={<p className="text-muted">DB 연결 확인 중…</p>}>
          <HealthCard />
        </Suspense>
        <Suspense fallback={null}>
          <AiUsageCard />
        </Suspense>
        <DeleteRequests />
        <YearEndPanel />
      </div>
    </>
  );
}

async function Teachers() {
  let teachers;
  try {
    teachers = await listTeachers();
  } catch (err) {
    console.error(err);
    return <p className="text-danger">교사 목록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return <TeacherAccounts teachers={teachers} />;
}
