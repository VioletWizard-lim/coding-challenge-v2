import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/Header";
import { getSession, homeFor } from "@/lib/session";
import PasswordForm from "./PasswordForm";

/** 내 계정: 비밀번호 바꾸기 (학생·교사·관리자 공용) */
export default function AccountPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<p className="p-6 text-muted">불러오는 중…</p>}>
        <Account />
      </Suspense>
    </main>
  );
}

async function Account() {
  const session = await getSession();
  if (!session) redirect("/");
  return (
    <>
      <Header name={session.name} role={session.role} />
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
        <Link href={homeFor(session.role)} className="text-sm text-muted hover:text-brand hover:underline">
          ← 내 화면으로 돌아가기
        </Link>
        <div>
          <h1 className="text-2xl font-black">🔑 비밀번호 바꾸기</h1>
          <p className="mt-1 text-sm leading-6 text-muted">
            선생님이 정해 준 비밀번호를 나만 아는 것으로 바꿀 수 있어요. 바꾸면 다른 컴퓨터에 로그인해 둔 것은 로그아웃돼요.
            {session.role === "student" && " 잊어버리면 선생님께 말씀하세요. 선생님이 새로 정해 줘요."}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <PasswordForm id={session.id} />
        </div>
      </div>
    </>
  );
}
