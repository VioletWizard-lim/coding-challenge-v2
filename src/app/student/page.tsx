import { redirect } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/Header";
import { getUserProfile } from "@/lib/auth";
import { allowedSubjects } from "@/lib/problems";
import { requireRole } from "@/lib/session";
import JourneyTab from "./JourneyTab";
import MySubmissions from "./MySubmissions";
import StudentTabs from "./StudentTabs";
import Workspace from "./Workspace";

export default function StudentPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
        <StudentHome />
      </Suspense>
    </main>
  );
}

async function StudentHome() {
  const session = await requireRole("student");
  const profile = await getUserProfile(session.id);
  if (!profile) redirect("/");
  return (
    <>
      <Header name={profile.name} role="student" />
      <StudentTabs
        tabs={[
          {
            id: "write",
            label: "📝 코드 작성",
            content: <Workspace userId={profile.id} subjects={allowedSubjects(profile.subjects)} />,
          },
          {
            id: "submissions",
            label: "📊 내 제출 현황",
            content: (
              <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
                <div className="mx-auto max-w-5xl">
                  <MySubmissions name={profile.name} />
                </div>
              </Suspense>
            ),
          },
          {
            id: "journey",
            label: "🧭 나의 학습 여정",
            content: (
              <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
                <div className="mx-auto max-w-5xl">
                  <JourneyTab name={profile.name} />
                </div>
              </Suspense>
            ),
          },
        ]}
      />
    </>
  );
}
