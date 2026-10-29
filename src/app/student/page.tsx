import { redirect } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/Header";
import { getUserProfile } from "@/lib/auth";
import { allowedSubjects, SUBJECTS } from "@/lib/problems";
import { listOpenProblems } from "@/lib/problemStore";
import { requireRole } from "@/lib/session";
import { ACHIEVEMENTS_TAB } from "@/lib/achievements";
import AchievementsTab from "./AchievementsTab";
import JourneyTab from "./JourneyTab";
import MySubmissions from "./MySubmissions";
import ReflectionTab from "./ReflectionTab";
import SideTabs from "@/components/SideTabs";
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
  const subjects = allowedSubjects(profile.subjects);
  const problems = await listOpenProblems(subjects);
  // 제출 목록·학습 여정에 보일 문제 이름: 원래 목록 + 지금 공개된 문제 (공개 전 문제 제목은 학생에게 보내지 않음)
  const titles: Record<string, string> = {};
  for (const [subject, list] of Object.entries(SUBJECTS)) {
    for (const [number, title] of Object.entries(list)) titles[`${subject}_${number}`] = title;
  }
  for (const p of problems) titles[`${p.subject}_${p.number}`] = p.title;
  return (
    <>
      <Header name={profile.name} role="student" />
      <SideTabs
        titles={titles}
        tabs={[
          {
            id: "write",
            label: "📝 코드 작성",
            content: <Workspace userId={profile.id} subjects={subjects} problems={problems} />,
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
            id: "reflection",
            label: "💭 오늘의 성찰",
            content: (
              <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
                <div className="mx-auto max-w-3xl">
                  <ReflectionTab userId={profile.id} name={profile.name} subjects={subjects} problems={problems} />
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
                  <JourneyTab userId={profile.id} name={profile.name} />
                </div>
              </Suspense>
            ),
          },
          {
            id: ACHIEVEMENTS_TAB,
            label: "🏅 업적",
            content: (
              <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
                <div className="mx-auto max-w-5xl">
                  <AchievementsTab userId={profile.id} name={profile.name} problems={problems} />
                </div>
              </Suspense>
            ),
          },
        ]}
      />
    </>
  );
}
