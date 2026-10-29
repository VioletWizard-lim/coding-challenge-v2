import { SITE } from "@/lib/site";

/** 맨 위 막대: 왼쪽 사이트 이름, 오른쪽 위 이름·로그아웃 */
export default function Header({ name, role }: { name: string; role: "student" | "teacher" }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between gap-3 px-4 md:px-6">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-lg font-black">
            {SITE.icon} {SITE.name}
          </span>
          <span className="hidden truncate text-sm text-muted sm:inline">
            {SITE.nameKo} · {SITE.subtitle}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
            {role === "teacher" ? "교사" : "학생"}
          </span>
          <span className="hidden font-bold sm:inline">{name}님</span>
          <form action="/logout" method="post">
            <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-page">
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
