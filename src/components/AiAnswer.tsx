"use client";

import type { ReactNode } from "react";
import type { AiChat } from "@/lib/aiChat";
import { splitMomentRefs, type Moment } from "@/lib/process-summary";

/** `print()` 같은 백틱 부분은 코드 글꼴로, **굵게**는 굵은 글씨로 (AI 답의 마크다운 표시를 그대로 보이지 않게) */
function withCode(text: string, keyBase: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-white/70 px-1 font-[family-name:var(--font-code)] text-[0.92em] ring-1 ring-line">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    return part.replace(/^#{1,6}\s+/gm, ""); // 제목 표시(#)가 섞여 와도 글자만
  });
}

/**
 * AI 답 글 (학생 AI 도우미·교사 열람 화면 공용).
 * [[M3]]은 onMoment가 있으면 누르면 그 순간의 재생으로 가는 버튼, 없으면 ‹순간 설명›으로 보여 준다.
 */
export default function AiAnswer({ chat, onMoment }: { chat: Pick<AiChat, "answer" | "moments">; onMoment?: (m: Moment) => void }) {
  return (
    <>
      {splitMomentRefs(chat.answer, chat.moments).map((part, i) =>
        !("moment" in part) ? (
          withCode(part.text, String(i))
        ) : onMoment ? (
          <button
            key={i}
            type="button"
            onClick={() => onMoment(part.moment)}
            title="눌러서 이 순간의 재생 보기"
            className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 align-baseline text-sm font-medium text-blue-800 hover:bg-blue-100"
          >
            ⏪ {part.moment.label}
          </button>
        ) : (
          <span key={i} title="AI가 가리킨 작성 과정의 순간" className="text-blue-800">
            ‹{part.moment.label}›
          </span>
        ),
      )}
    </>
  );
}
