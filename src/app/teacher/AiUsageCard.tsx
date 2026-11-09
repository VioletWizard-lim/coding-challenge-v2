import { estimateCost, kstDayStart, kstMonthStart, usageByModel, type Usage } from "@/lib/aiChat";
import { reviewUsageSince } from "@/lib/aiReviewStore";
import { draftUsageSince } from "@/lib/gradingDraftStore";
import { aiUsageSummary } from "@/lib/aiChatStore";
import { practiceUsageSince } from "@/lib/practiceStore";
import { listTeachers } from "@/lib/teacher";
import { trialUsageSince } from "@/lib/trialStore";

const dollars = (d: number) => (d < 0.01 ? "0.01달러 미만" : `${d.toFixed(2)}달러`);

const money = (rows: Usage[]) => {
  const c = estimateCost(rows);
  if (!rows.length) return "";
  return c.known ? ` · 약 ${dollars(c.dollars)}` : ` · 토큰 ${(c.inputTokens + c.outputTokens).toLocaleString()}개`;
};

/**
 * AI 사용량 (오늘·이번 달 횟수와 예상 비용).
 * - 교사 화면(teacherId): 학생 AI 사용은 학교 전체, 채점 초안은 내가 만든 것만
 * - 관리자 화면(teacherId 없음): 학생 AI 사용 전체 + 채점 초안 전체와 교사별
 * (학생 사용을 교사별로 나누려면 교사 ↔ 담당 반 연결이 필요하다 — 다른 교사가 함께 쓰게 될 때)
 */
export default async function AiUsageCard({ teacherId }: { teacherId?: string }) {
  let data;
  let names = new Map<string, string>();
  try {
    const [chats, reviews, practice, allDrafts, teachers, trial] = await Promise.all([
      aiUsageSummary(),
      reviewUsageSince(kstMonthStart()),
      practiceUsageSince(kstMonthStart()),
      draftUsageSince(kstMonthStart()),
      teacherId ? Promise.resolve([]) : listTeachers(),
      trialUsageSince(kstMonthStart()).catch(() => []),
    ]);
    names = new Map(teachers.map((t) => [t.id, t.name]));
    const drafts = teacherId ? allDrafts.filter((d) => d.teacherId === teacherId) : allDrafts;
    // AI 되돌아보기, 연습 문제 만들기도 함께 센다
    const dayStart = new Date(kstDayStart());
    const student = [...reviews, ...practice];
    data = {
      ready: chats.ready,
      today: [...chats.today, ...student.filter((r) => new Date(r.createdAt) >= dayStart)],
      month: [...chats.month, ...student],
      drafts,
      trial,
    };
  } catch (err) {
    console.error(err);
    return null;
  }
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <h3 className="font-bold">🤖 AI 사용량</h3>
      <p className="-mt-2 text-xs text-muted">
        학생: 도우미 질문 + 되돌아보기 + 연습 문제 (학교 전체, 아래 횟수) · {teacherId ? "채점 초안: 내가 만든 것" : "채점 초안: 모든 교사"}
      </p>
      {data.ready ? (
        <>
          <p>
            오늘 <b className="text-2xl text-blue-700">{data.today.length}</b>번
            <span className="text-sm text-muted">{money(data.today)}</span>
          </p>
          <p className="text-sm">
            이번 달 <b>{data.month.length}</b>번<span className="text-muted">{money(data.month)}</span>
          </p>
          {data.drafts.length > 0 && (
            <p className="text-sm">
              {teacherId ? "내 채점 초안" : "교사 채점 초안 (전체)"} 이번 달 <b>{data.drafts.length}</b>번
              <span className="text-muted">{money(data.drafts)}</span>
            </p>
          )}
          {data.trial.length > 0 && (
            <p className="text-sm">
              🧪 체험 페이지(심사용) 이번 달 <b>{data.trial.length}</b>번<span className="text-muted">{money(data.trial)}</span>
            </p>
          )}
          {!teacherId && data.drafts.length > 0 && (
            <ul className="-mt-2 ml-4 list-disc text-xs text-muted">
              {[...new Set(data.drafts.map((d) => d.teacherId ?? ""))].map((id) => {
                const mine = data.drafts.filter((d) => (d.teacherId ?? "") === id);
                return (
                  <li key={id}>
                    {!id ? "(교사 기록 없음)" : names.get(id) ? `${names.get(id)} (${id})` : id} · {mine.length}번{money(mine)}
                  </li>
                );
              })}
            </ul>
          )}
          {data.month.length + data.drafts.length + data.trial.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">
                이번 달 모델별 자세히{teacherId ? " (학생 전체 + 내 채점 초안)" : " (콘솔 Usage와 맞춰 보기)"}
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {usageByModel([...data.month, ...data.drafts, ...data.trial]).map((m) => (
                  <li key={m.model}>
                    <span className="font-mono">{m.model}</span> · {m.count}번 · 입력 {m.inputTokens.toLocaleString()} / 출력{" "}
                    {m.outputTokens.toLocaleString()} 토큰{m.known ? ` · 약 ${dollars(m.dollars)}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-muted">
            학습지 업로드(AI)는 여기에 들어가지 않아요. 비용은 어림값이에요. 정확한 금액은 Anthropic 콘솔(Usage)에서 확인하세요.
            {teacherId && <> 대화 내용은 &lsquo;🤖 AI 대화&rsquo; 탭에서 볼 수 있어요.</>}
          </p>
        </>
      ) : (
        <p className="text-sm text-amber-900">
          ⚠️ AI 도우미를 쓰려면 Supabase SQL Editor에서 <code>supabase/migrations/010_ai_chats.sql</code>을 실행해 주세요.
        </p>
      )}
    </section>
  );
}
