/**
 * 브라우저 확인 창(confirm)이 뜨면 창이 포커스를 잃어서, 작성 기록에 "다른 창으로 이동"이 찍힌다.
 * 사이트 안에서 띄운 확인 창은 창 이탈이 아니므로, 그동안(과 닫힌 뒤 잠깐)은 창 이탈을 기록하지 않게 한다.
 * RecordingEditor가 isQuiet()로 확인한다. 클라이언트 전용.
 */
let quietUntil = 0;

/** 지금 사이트가 띄운 창 때문에 생긴 이탈·복귀인지 */
export const isQuiet = () => Date.now() < quietUntil;

/** confirm()과 같지만, 창 이탈로 기록되지 않는다 */
export function quietConfirm(message: string): boolean {
  quietUntil = Number.POSITIVE_INFINITY;
  try {
    return window.confirm(message);
  } finally {
    // 창이 닫힌 뒤 늦게 도착하는 신호까지 무시하도록 조금 기다렸다가 푼다
    quietUntil = Date.now() + 500;
  }
}
