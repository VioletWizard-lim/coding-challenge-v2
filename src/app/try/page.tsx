import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import { SITE } from "@/lib/site";
import TryClient from "./TryClient";

export const metadata: Metadata = {
  title: `체험하기 · ${SITE.name}`,
  description: "로그인 없이 코드 작성 → 과정 재생 → AI와 되돌아보기 → 성찰을 체험해 봅니다. 체험 내용은 저장하지 않습니다.",
};

/**
 * 🧪 체험 페이지 (로그인 없음, 저장 없음). 심사위원·방문자가 수업 흐름을 한 번에 체험한다.
 * 실제 학생 화면의 부품을 그대로 쓰고, 진짜 AI는 체험 코드(TRY_ACCESS_CODE)를 넣은 뒤에만.
 */
export default function TryPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-5 px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 font-black">
          <Logo className="h-7 w-7" />
          {SITE.name}
        </Link>
        <span className="hidden text-sm font-bold text-brand sm:inline">
          {SITE.nameKo} · {SITE.subtitle}
        </span>
        <Link href="/" className="ml-auto shrink-0 rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:bg-page">
          로그인
        </Link>
      </div>
      <TryClient />
    </main>
  );
}
