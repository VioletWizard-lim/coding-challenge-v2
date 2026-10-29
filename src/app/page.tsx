import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession, homeFor } from "@/lib/session";
import { SITE } from "@/lib/site";
import LoginForm from "./LoginForm";

/** 첫 화면(로그인). 화면 자체는 정적으로 만들어 바로 뜨고, 이미 로그인했으면 내 화면으로 보낸다. */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-black">
          {SITE.icon} {SITE.name}
        </h1>
        <p className="mt-1 font-bold text-brand">
          {SITE.nameKo} · {SITE.subtitle}
        </p>
        <p className="mt-2 text-muted">내가 코드를 어떻게 썼는지 기록하고 돌아봐요</p>
      </div>
      <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
        <LoginForm />
      </div>
      <p className="mt-4 text-center text-xs text-muted">계정은 선생님이 만들어 줘요. 비밀번호를 잊었으면 선생님께 말씀하세요.</p>
      <Suspense>
        <RedirectIfLoggedIn />
      </Suspense>
    </main>
  );
}

async function RedirectIfLoggedIn() {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));
  return null;
}
