import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "파이썬 코딩 챌린지",
  description: "코드를 어떻게 썼는지 기록하고 돌아보는 수업 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
