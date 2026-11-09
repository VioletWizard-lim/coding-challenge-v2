"use client";

/**
 * AI 도우미 창을 여는 버튼 (수업 문제 작성, 연습 문제 풀기, 체험 페이지 공용).
 * 편집기 바로 위에 넓게 두어 잘 보이게: 무엇을 근거로 돕는지(내 작성 과정)도 함께 적는다.
 */
export default function AiHelperButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-xl border border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2.5 text-left shadow-sm transition hover:border-blue-500 hover:shadow"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg shadow" aria-hidden>
        🤖
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-bold text-blue-900">막히면 AI 도우미에게 물어보기</span>
        <span className="text-xs text-blue-800/80">내가 코드를 써 온 과정(성공한 순간, 반복된 오류, 멈춘 곳)을 보고 힌트를 줘요 · 정답 코드는 알려 주지 않아요</span>
      </span>
      <span className="ml-auto shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white group-hover:bg-blue-700">열기 →</span>
    </button>
  );
}
