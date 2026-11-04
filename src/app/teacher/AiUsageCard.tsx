import { estimateCost, type Usage } from "@/lib/aiChat";
import { aiUsageSummary } from "@/lib/aiChatStore";

const money = (rows: Usage[]) => {
  const c = estimateCost(rows);
  if (!rows.length) return "";
  return c.known ? ` · 약 ${c.dollars < 0.01 ? "0.01달러 미만" : `${c.dollars.toFixed(2)}달러`}` : ` · 토큰 ${(c.inputTokens + c.outputTokens).toLocaleString()}개`;
};

/** 교사 처음 화면: 학생 AI 도우미 사용량 (오늘·이번 달 질문 수와 예상 비용) */
export default async function AiUsageCard() {
  let data;
  try {
    data = await aiUsageSummary();
  } catch (err) {
    console.error(err);
    return null;
  }
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <h3 className="font-bold">🤖 AI 도우미 사용량</h3>
      {data.ready ? (
        <>
          <p>
            오늘 <b className="text-2xl text-blue-700">{data.today.length}</b>번
            <span className="text-sm text-muted">{money(data.today)}</span>
          </p>
          <p className="text-sm">
            이번 달 <b>{data.month.length}</b>번<span className="text-muted">{money(data.month)}</span>
          </p>
          <p className="text-xs text-muted">
            비용은 어림값이에요. 정확한 금액은 Anthropic 콘솔(Usage)에서 확인하세요. 대화 내용은 &lsquo;🤖 AI 대화&rsquo;
            탭에서 볼 수 있어요.
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
