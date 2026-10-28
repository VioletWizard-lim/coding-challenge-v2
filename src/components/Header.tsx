export default function Header({ name, role }: { name: string; role: "student" | "teacher" }) {
  return (
    <header className="flex items-center justify-between rounded-xl border border-line bg-white px-5 py-3.5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-white">
          {role === "teacher" ? "교사" : "학생"}
        </span>
        <span className="text-lg font-bold">{name}님 환영합니다 👋</span>
      </div>
      <form action="/logout" method="post">
        <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-page">
          로그아웃
        </button>
      </form>
    </header>
  );
}
