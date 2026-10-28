import { Suspense } from "react";
import Header from "@/components/Header";
import { requireRole } from "@/lib/session";

export default function TeacherPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
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
      <section className="rounded-xl border border-line bg-white p-6">
        <h2 className="text-xl font-bold">👨‍🏫 교사 화면</h2>
        <p className="mt-2 text-muted">
          채점·학생 관리 화면은 다음 단계에서 만들어요. 그동안은 기존(v1) 교사 화면을 써 주세요.
        </p>
      </section>
    </>
  );
}
