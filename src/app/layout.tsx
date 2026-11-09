import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: `${SITE.name} · ${SITE.subtitle}`,
  description: SITE.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        {children}
        {/* 모든 화면 아래: 개인정보·AI 이용 안내 (미성년자 보호 규칙: 사이트에 공개) */}
        <footer className="border-t border-line px-4 py-3 text-center text-xs text-muted">
          <Link href="/privacy" className="hover:text-brand hover:underline">
            개인정보·AI 이용 안내
          </Link> ·{" "}
          <Link href="/guide" className="hover:text-brand hover:underline">
            선생님용 사용 안내
          </Link> ·{" "}
          <Link href="/try" className="hover:text-brand hover:underline">
            체험하기
          </Link>
        </footer>
      </body>
    </html>
  );
}
