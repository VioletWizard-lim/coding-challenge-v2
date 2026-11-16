/**
 * 지우기 전에 적는 확인 문구 (예: "test01 홍길동 삭제", "2026학년도 삭제").
 * 화면과 서버가 같은 기준으로 맞는지 본다. 앞뒤 공백과 여러 칸 띄어쓰기는 한 칸으로 본다. 단위 테스트: confirmPhrase.test.ts
 */
const tidy = (s: string) => String(s ?? "").trim().replace(/\s+/g, " ");

/** 적은 글이 확인 문구와 같은지 */
export const samePhrase = (typed: string, phrase: string) => tidy(typed) === tidy(phrase);

export type PhraseChar = { ch: string; state: "ok" | "wrong" | "todo" };

/** 확인 문구의 글자마다: 맞게 적었는지(ok), 다르게 적었는지(wrong), 아직 안 적었는지(todo) */
export function phraseProgress(typed: string, phrase: string): { chars: PhraseChar[]; extra: boolean } {
  const t = String(typed ?? "").replace(/^\s+/, "").replace(/\s+/g, " ");
  const p = tidy(phrase);
  // 한글은 치는 중간에 다른 글자처럼 보인다(예: "테스"를 치다 보면 잠깐 "텟"). 적고 있는 마지막 한글 글자는 틀렸다고 하지 않는다
  const composing = (i: number) => i === t.length - 1 && /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(t[i]);
  const chars = [...p].map((ch, i): PhraseChar => ({
    ch,
    state: i >= t.length ? "todo" : t[i] === ch ? "ok" : composing(i) ? "todo" : "wrong",
  }));
  return { chars, extra: t.trimEnd().length > p.length };
}
