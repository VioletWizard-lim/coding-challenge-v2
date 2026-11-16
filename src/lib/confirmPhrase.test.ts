import { describe, expect, it } from "vitest";
import { phraseProgress, samePhrase } from "./confirmPhrase";

describe("확인 문구", () => {
  it("앞뒤 공백·여러 칸 띄어쓰기는 같은 것으로 본다", () => {
    expect(samePhrase("  test01  홍길동 삭제 ", "test01 홍길동 삭제")).toBe(true);
    expect(samePhrase("test01 홍길동", "test01 홍길동 삭제")).toBe(false);
    expect(samePhrase("test01 홍길동 삭제함", "test01 홍길동 삭제")).toBe(false);
  });
  it("글자마다 맞았는지·틀렸는지·남았는지", () => {
    const { chars, extra } = phraseProgress("tesx", "test 삭제");
    expect(chars.map((c) => c.state).join(",")).toBe("ok,ok,ok,wrong,todo,todo,todo");
    expect(extra).toBe(false);
    expect(phraseProgress("test 삭제!", "test 삭제").extra).toBe(true);
    expect(phraseProgress("test  삭", "test 삭제").chars.map((c) => c.state).join(",")).toBe("ok,ok,ok,ok,ok,ok,todo");
  });
  it("치고 있는 마지막 한글 글자는 틀렸다고 하지 않는다", () => {
    expect(phraseProgress("부하 텟", "부하 테스트").chars.map((c) => c.state).join(",")).toBe("ok,ok,ok,todo,todo,todo");
    // 그 뒤에 글자를 더 쳤는데도 다르면 틀린 것
    expect(phraseProgress("부하 텟스", "부하 테스트").chars[3].state).toBe("wrong");
  });
});
