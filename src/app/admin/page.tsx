import { Suspense } from "react";
import Header from "@/components/Header";
import SideTabs from "@/components/SideTabs";
import { listDeleteRequests } from "@/lib/deleteRequestStore";
import { requireRole } from "@/lib/session";
import { listTeachers } from "@/lib/teacher";
import AiUsageCard from "../teacher/AiUsageCard";
import HealthCard from "../teacher/HealthCard";
import AdminShortcuts from "./AdminShortcuts";
import DeleteRequests from "./DeleteRequests";
import TeacherAccounts from "./TeacherAccounts";
import TrialPageCard from "./TrialPageCard";
import YearEndPanel from "./YearEndPanel";

/** 🛠 관리자 페이지: 관리자(role=admin) 계정만. 왼쪽 메뉴로 나눔 (교사·학생 화면과 같은 SideTabs) */
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
  // 기다리는 학생 삭제 요청 수 (메뉴·바로 가기에 표시). 표가 없거나 못 읽으면 0
  const pendingDeletes = await listDeleteRequests()
    .then((r) => r.requests.filter((x) => x.status === "pending").length)
    .catch(() => 0);
  return (
    <>
      <Header name={session.name} role="admin" />
      <SideTabs
        rememberAs="admin"
        tabs={[
          {
            id: "home",
            label: "🏠 처음 화면",
            content: (
              <div className="mx-auto flex max-w-4xl flex-col gap-5">
                <div className="flex flex-col gap-3">
                  <div>
                    <h1 className="text-2xl font-black">🛠 관리자</h1>
                    <p className="text-sm text-muted">교사 계정과 서비스 상태를 관리해요. 수업·채점은 교사 계정으로 해 주세요.</p>
                  </div>
                  <AdminShortcuts pendingDeletes={pendingDeletes} />
                </div>
                <Suspense fallback={<p className="text-muted">DB 연결 확인 중…</p>}>
                  <HealthCard />
                </Suspense>
                <Suspense fallback={null}>
                  <AiUsageCard />
                </Suspense>
              </div>
            ),
          },
          {
            id: "teachers",
            label: "👩‍🏫 교사 계정",
            content: (
              <div className="mx-auto max-w-4xl">
                <Suspense fallback={<p className="text-muted">교사 목록 불러오는 중…</p>}>
                  <Teachers />
                </Suspense>
              </div>
            ),
          },
          {
            id: "deletes",
            label: `🧑‍🎓 학생 삭제 요청${pendingDeletes ? ` (${pendingDeletes})` : ""}`,
            content: (
              <div className="mx-auto max-w-4xl">
                <DeleteRequests />
              </div>
            ),
          },
          {
            id: "trial",
            label: "🧪 체험 페이지",
            content: (
              <div className="mx-auto max-w-4xl">
                <TrialPageCard />
              </div>
            ),
          },
          {
            id: "year-end",
            label: "🗓 학년도 말 정리",
            content: (
              <div className="mx-auto max-w-4xl">
                <YearEndPanel />
              </div>
            ),
          },
        ]}
      />
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
