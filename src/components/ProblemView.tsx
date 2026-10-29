import { conditionList, type Problem } from "@/lib/problemBank";

/**
 * 학생에게 보이는 문제: 난이도 · 문제 · 조건 · 예시 · 문제 목표 · 도전 과제 (빈 칸은 숨김)
 * 학생 편집기 옆에서는 길면 안에서 스크롤(스크롤 막대를 보여 줘서 더 있다는 걸 알게), 교사 미리보기(fit)는 다 펼쳐서 바깥 페이지만 스크롤한다.
 */
export default function ProblemView({ problem: p, fit = false }: { problem: Problem; fit?: boolean }) {
  const conditions = conditionList(p.conditions);
  const empty = !p.description && !conditions.length && !p.examples.length && !p.goal && !p.challenge;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-brand">
          {p.subject} {p.number}
          {p.difficulty && (
            <span
              className="text-amber-500"
              aria-label={`난이도 별 ${p.difficulty}개`}
              title={`난이도 별 ${p.difficulty}개`}
            >
              {"★".repeat(p.difficulty)}
              <span className="text-slate-300">{"★".repeat(5 - p.difficulty)}</span>
            </span>
          )}
        </p>
        <h2 className="text-2xl font-black">{p.title === p.number ? `${p.number}번 문제` : p.title}</h2>
      </div>

      {empty ? (
        <div className="rounded-lg border border-dashed border-line bg-page p-4 text-sm leading-6 text-muted">
          이 문제는 설명이 아직 없어요. 선생님이 안내한 문제를 보고 편집기에 코드를 작성하세요.
        </div>
      ) : (
        <div className={`flex flex-col gap-4 text-[15px] leading-7 ${fit ? "" : "max-h-[60vh] overflow-auto pr-2"}`}>
          {p.description && (
            <Part title="📝 문제">
              <p className="whitespace-pre-wrap">{p.description}</p>
            </Part>
          )}
          {conditions.length > 0 && (
            <Part title="✅ 조건">
              <ol className="list-decimal pl-5">
                {conditions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ol>
            </Part>
          )}
          {p.examples.length > 0 && (
            <Part title="💡 예시">
              {/* 예시마다 상자 하나: 위에 입력값(파란 글씨), 아래에 출력. 넓으면 나란히 */}
              <div className="@container">
                <div className={`grid gap-2 ${p.examples.length > 1 ? "@xl:grid-cols-2" : ""}`}>
                  {p.examples.map((ex, i) => (
                    <div key={i} className="min-w-0 overflow-hidden rounded-md border border-line bg-page">
                      {ex.input && (
                        <p className="border-b border-line bg-brand-soft/60 px-3 py-1.5 font-bold whitespace-pre-wrap text-brand">
                          <span className="sr-only">입력: </span>
                          {ex.input}
                        </p>
                      )}
                      <pre className={`${fit ? "scrollbar-none " : ""}overflow-x-auto px-3 py-2 font-[family-name:var(--font-code)] text-sm leading-6`}>
                        <span className="sr-only">출력: </span>
                        {ex.output}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
              {p.examples.some((ex) => ex.input) && (
                <p className="mt-1 text-xs text-muted">파란 글씨는 입력값, 그 아래는 출력이에요.</p>
              )}
            </Part>
          )}
          {p.goal && (
            <Part title="🎯 문제 목표">
              <p className="whitespace-pre-wrap">{p.goal}</p>
            </Part>
          )}
          {p.challenge && (
            <section className="rounded-lg border-2 border-dashed border-violet-300 bg-violet-50 p-3">
              <h3 className="mb-1 font-bold text-violet-800">🚀 도전 과제 (경험자용)</h3>
              <p className="whitespace-pre-wrap">{p.challenge}</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 font-bold">{title}</h3>
      {children}
    </section>
  );
}
