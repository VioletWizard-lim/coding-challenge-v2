import { redirect } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/Header";
import { getUserProfile } from "@/lib/auth";
import { allowedSubjects } from "@/lib/problems";
import { requireRole } from "@/lib/session";
import Workspace from "./Workspace";

export default function StudentPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-muted">불러오는 중…</p>}>
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
      <Workspace userId={profile.id} subjects={allowedSubjects(profile.subjects)} />
    </>
  );
}
