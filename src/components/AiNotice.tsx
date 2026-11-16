"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

/**
 * 학생이 AI 기능(도우미·되돌아보기·연습 문제)을 처음 쓸 때 한 번 보이는 안내 (Anthropic "미성년자 대상 서비스 가이드라인"의 학생 교육).
 * 확인하면 이 브라우저에 아이디별로 기억한다(DB는 바꾸지 않음 — 다른 컴퓨터에서는 한 번 더 보임).
 * 학생 화면만 AiNoticeProvider로 감싼다. 교사 화면·체험 페이지에는 Provider가 없어 안내가 나오지 않는다.
 */
const Context = createContext<string | null>(null);
const EVENT = "lbl:ai-notice";
const keyOf = (userId: string) => `ai_notice_seen:${userId}`;

export function AiNoticeProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return <Context value={userId}>{children}</Context>;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function seen(userId: string) {
  try {
    return localStorage.getItem(keyOf(userId)) !== null;
  } catch {
    return true; // 저장소를 못 쓰는 브라우저에서는 막지 않는다
  }
}

/** needed: 아직 안내를 확인하지 않음 (이때 AI를 부르는 버튼을 꺼 둔다) */
export function useAiNotice(): { needed: boolean; confirm: () => void } {
  const userId = useContext(Context);
  const needed = useSyncExternalStore(
    subscribe,
    () => (userId ? !seen(userId) : false),
    () => false,
  );
  return {
    needed,
    confirm() {
      if (!userId) return;
      try {
        localStorage.setItem(keyOf(userId), new Date().toISOString());
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
  };
}

/** 안내 카드: 확인하기 전에만 보인다 */
export default function AiNoticeCard() {
  const { needed, confirm } = useAiNotice();
  if (!needed) return null;
  return (
    <div role="note" aria-label="AI 사용 안내" className="flex flex-col gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
      <p className="font-bold">🤖 AI를 쓰기 전에 꼭 읽어 주세요</p>
      <ul className="list-disc pl-5">
        <li>
          지금 대화하는 상대는 사람이 아니라 <b>AI</b>예요. AI의 말은 <b>틀릴 수 있어요.</b> 그대로 믿지 말고 직접 실행해서 확인하세요.
        </li>
        <li>
          이름, 전화번호, 주소 같은 <b>개인정보는 적지 마세요.</b>
        </li>
        <li>
          AI는 이 수업의 파이썬 공부만 도와줘요. 정답 코드는 주지 않고, 내가 써 온 과정을 보고 힌트를 줘요.
        </li>
        <li>
          이상하거나 불편한 답은 <b>🚩 알리기</b>를 눌러 선생님께 알려 주세요. AI와 나눈 대화는 선생님도 볼 수 있어요.
        </li>
        <li>힘든 일이 있으면 AI가 아니라 선생님이나 믿을 수 있는 어른에게 이야기해 주세요. (청소년상담 1388)</li>
      </ul>
      <button type="button" onClick={confirm} className="self-start rounded-lg bg-blue-600 px-4 py-1.5 font-bold text-white hover:bg-blue-700">
        읽었어요, 시작하기
      </button>
    </div>
  );
}
