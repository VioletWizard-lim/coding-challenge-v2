"use client";

import type { ReactNode } from "react";

/** 처음 화면으로 가라는 신호 (SideTabs가 받아 첫 탭을 연다) */
export const GO_HOME_EVENT = "lbl:go-home";

/**
 * 위쪽 로고·사이트 이름: 누르면 처음 화면 탭으로. 같은 페이지 안에서는 새로고침 없이 탭만 바꿔서
 * 작성 중인 코드·열어 둔 재생이 그대로 남는다. (자바스크립트가 없으면 링크로 이동)
 */
export default function HomeLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (window.location.pathname !== href || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        window.dispatchEvent(new Event(GO_HOME_EVENT));
      }}
      className="flex min-w-0 items-center gap-2 rounded-lg hover:opacity-80"
      title="처음 화면으로"
    >
      {children}
    </a>
  );
}
