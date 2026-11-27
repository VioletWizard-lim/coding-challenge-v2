import { describe, expect, it } from "vitest";
import { askedBackText, continuesThread, decideAsk, nudgeDue, nudgeKind, nudgeRange, nudgeText } from "./askBack";
import { currentStuck, findStuckMoments, meaningfulLines, strongestStuck, summarizeProcess } from "./process-summary";
import { analyzeLog } from "./replay";

const S = 1000;
const MIN = 60 * S;
/** line(0부터)의 맨 앞에 글자를 넣는 편집 */
const type = (t: number, line: number, text: string, kind = "i") => [t, kind, line, 0, line, 0, text];
const run = (t: number, result = "ok") => [t, result === "ok" ? "r:ok" : `r:${result}`];

describe("막힌 순간 찾기", () => {
  it("같은 오류가 3번 이어지면 error-repeat (마지막까지 못 고친 것만)", () => {
    const log = [type(0, 0, "print(x)\n"), run(10 * S, "NameError"), type(20 * S, 0, "a"), run(30 * S, "NameError"), type(40 * S, 0, "b"), run(50 * S, "NameError")];
    const m = currentStuck("", log, 60 * S)!;
    expect(m).toMatchObject({ rule: "error-repeat", count: 3, error: "NameError", from: 10 * S, to: 50 * S });
    // 뒤에 고쳤으면 지금 막힌 것이 아니다
    expect(findStuckMoments("", [...log, run(70 * S)]).some((x) => x.rule === "error-repeat")).toBe(false);
  });

  it("같은 줄로 4번 돌아와 고치면 same-line (처음 타이핑은 글자 수와 상관없이 한 번)", () => {
    const log: unknown[] = [];
    let t = 0;
    [..."for i in range(5):"].forEach((ch, i) => log.push([(t += 200), "i", 0, i, 0, i, ch])); // 한 번 방문
    for (let k = 0; k < 3; k++) {
      log.push(run((t += 10 * S), "SyntaxError"));
      log.push(type((t += 5 * S), 0, String(k))); // 실행 뒤 같은 줄 → 새 방문
    }
    const m = findStuckMoments("", log).find((x) => x.rule === "same-line")!;
    expect(m).toMatchObject({ line: 1, count: 4 });
    expect(m.lineVersions).toHaveLength(4);
    expect(m.lineVersions[3]).toBe("210for i in range(5):");
  });

  it("다른 줄을 오가며 고치면 따로 센다, 시간이 오래 걸리면 세지 않는다", () => {
    const spread = [type(0, 0, "a"), type(1 * S, 1, "b"), type(2 * S, 0, "c"), type(3 * S, 1, "d"), type(4 * S, 0, "e"), type(5 * S, 1, "f"), type(6 * S, 0, "g")];
    expect(findStuckMoments("\n", spread).find((x) => x.rule === "same-line")).toMatchObject({ line: 1, count: 4 });
    const slow = [type(0, 0, "a"), run(1 * MIN, "x"), type(2 * MIN, 0, "b"), run(3 * MIN, "x"), type(4 * MIN, 0, "c"), run(5 * MIN, "x"), type(7 * MIN, 0, "d")];
    expect(findStuckMoments("", slow).some((x) => x.rule === "same-line")).toBe(false);
  });

  it("붙여넣은 뒤 첫 실행이 오류면 paste-error", () => {
    const log = [type(0, 0, "x = 1\n"), type(10 * S, 1, "print(x + '1')", "p"), run(20 * S, "TypeError")];
    expect(currentStuck("", log)).toMatchObject({ rule: "paste-error", line: 2, error: "TypeError" });
    // 붙여넣고 성공한 뒤의 오류는 아니다
    expect(findStuckMoments("", [type(0, 0, "a", "p"), run(5 * S), run(6 * S, "TypeError")]).some((x) => x.rule === "paste-error")).toBe(false);
  });

  it("3분 넘게 멈추면 long-pause, 다른 창에 가 있던 시간은 빼고, 지금까지 이어지는 멈춤도", () => {
    expect(findStuckMoments("", [type(0, 0, "a"), type(4 * MIN, 0, "b")])[0]).toMatchObject({ rule: "long-pause", line: 1, minutes: 4 });
    expect(findStuckMoments("", [type(0, 0, "a"), [1 * S, "b"], [4 * MIN, "f"], type(4 * MIN + S, 0, "b")])).toEqual([]);
    expect(currentStuck("", [type(0, 0, "a")], 5 * MIN)).toMatchObject({ rule: "long-pause", to: 5 * MIN });
  });

  it("지금 막힌 곳은 최근 10분 안, 같은 오류가 멈춤보다 먼저", () => {
    const log = [type(0, 0, "a"), type(4 * MIN, 0, "b"), run(5 * MIN, "E"), run(5 * MIN + S, "E"), run(5 * MIN + 2 * S, "E")];
    expect(currentStuck("", log)!.rule).toBe("error-repeat");
    expect(currentStuck("", [type(0, 0, "a"), type(4 * MIN, 0, "b")], 30 * MIN)).toMatchObject({ rule: "long-pause", to: 30 * MIN });
    expect(strongestStuck("", log)!.rule).toBe("error-repeat");
  });

  it("의미 있는 줄: 빈 줄·주석·시작 코드 줄은 빼고 센다", () => {
    expect(meaningfulLines("# 이름 입력\nname = input()\n\n", "name = input()")).toBe(0);
    expect(meaningfulLines("name = input()\nprint(name)", "")).toBe(2);
  });
});

describe("첫 되물음 (A·B·C)", () => {
  const code2 = [type(0, 0, "a = int(input())\nprint(a * 2)")];

  it("A: 이번 문제 기록에서 막힌 순간을 보여 주며 되묻는다 ([[M1]] → 그 구간 재생)", () => {
    const log = [...code2, run(10 * S, "ValueError"), run(20 * S, "ValueError"), run(30 * S, "ValueError")];
    const d = decideAsk({ init: "", log, now: 40 * S });
    expect(d.situation).toBe("A");
    expect(d.clip).toMatchObject({ rule: "error-repeat", count: 3, error: "ValueError" });
    expect(d.text).toContain("ValueError가 3번");
    expect(d.text).toContain("[[M1]]");
    expect(d.moments).toEqual([{ id: "M1", at: 10 * S, kind: "run-error", label: "ValueError 3번 난 구간" }]);
  });

  it("A: 막힘이 없으면 마지막 실행 결과로 되묻는다 (실행한 적이 없으면 예상을 묻는다)", () => {
    expect(decideAsk({ init: "", log: [...code2, run(5 * S)], now: 6 * S })).toMatchObject({ situation: "A", clip: { rule: "recent", lastRun: "ok" } });
    const never = decideAsk({ init: "", log: code2, now: 1 * S });
    expect(never.clip.lastRun).toBeNull();
    expect(never.text).toContain("아직 한 번도 실행하지 않았어요");
    expect(never.text).not.toContain("[[M1]]");
  });

  it("B: 코드가 거의 없고 이전 기록도 없으면 문제 이해를 되묻는다 (시작 코드는 세지 않음)", () => {
    const d = decideAsk({ init: "n = input()", log: [type(0, 1, "\n# 여기에")], now: 1 * S, starter: "n = input()" });
    expect(d.situation).toBe("B");
    expect(d.text).toContain("입력으로 무엇이 들어오고");
  });

  it("C: 코드가 거의 없지만 이전 문제 기록에 막힘이 있으면 그 기록을 보여 주며 되묻는다", () => {
    const prevLog = [type(0, 0, "x"), run(1 * S, "IndexError"), run(2 * S, "IndexError"), run(3 * S, "IndexError")];
    const d = decideAsk({
      init: "",
      log: [],
      now: 1 * S,
      previous: [
        { problem: "3-1", title: "평균", init: "", log: [type(0, 0, "ok")] },
        { problem: "3-2", title: "리스트 합", submissionId: 77, init: "", log: prevLog },
      ],
    });
    expect(d.situation).toBe("C");
    expect(d.clip.source).toEqual({ problem: "3-2", title: "리스트 합", submissionId: 77 });
    expect(d.text).toContain("지난번 3-2 리스트 합 문제에서 IndexError가 3번");
  });

  it("되묻는 말은 강제가 아니라고 알린다", () => {
    expect(decideAsk({ init: "", log: [], now: 0 }).text).toContain("'모르겠어요'라고 적어도");
  });

  it("되물음 뒤 같은 흐름: 15분 안이고 그 뒤 실행이 없으면", () => {
    const log = [type(0, 0, "a"), run(10 * S, "E")];
    expect(continuesThread(5 * S, log, 20 * S)).toBe(false); // 되물은 뒤 실행함
    expect(continuesThread(15 * S, log, 20 * S)).toBe(true);
    expect(continuesThread(15 * S, log, 15 * S + 16 * MIN)).toBe(false);
  });

  it("AI에 보내는 글에 되물은 말과 찾은 구간이 들어가고, 강제가 아니라는 안내·[[M1]]은 빠진다", () => {
    const log = [...code2, run(10 * S, "ValueError"), run(20 * S, "ValueError"), run(30 * S, "ValueError")];
    const text = askedBackText(decideAsk({ init: "", log, now: 40 * S }));
    expect(text).toContain("같은 오류 반복");
    expect(text).toContain("print(a * 2)");
    expect(text).not.toContain("[[M1]]");
    expect(text).not.toContain("모르겠어요");
  });
});

describe("막힘 알림 (P2)", () => {
  const errLog = [type(0, 0, "print(y)"), run(10 * S, "NameError"), run(20 * S, "NameError"), run(30 * S, "NameError")];

  it("지금 막힌 곳이 있으면 알린다, 같은 막힘은 다시 알리지 않는다", () => {
    const m = nudgeDue("", errLog, 40 * S)!;
    expect(m.rule).toBe("error-repeat");
    expect(nudgeText(m)).toBe("같은 NameError가 3번 이어서 났어요. 오류가 난 구간을 다시 볼까요?");
    expect(nudgeDue("", [...errLog, [41 * S, nudgeKind(m)], [45 * S, "n:close"]], 10 * MIN)).toBeNull();
  });

  it("마지막 알림에서 5분이 지나야 다른 막힘을 알린다", () => {
    const shown = [...errLog, [41 * S, "n:error-repeat@10000"], [42 * S, "n:close"]];
    // 같은 줄 반복 수정이 새로 생겨도 5분 전에는 알리지 않는다
    const more: unknown[] = [...shown];
    let t = 50 * S;
    for (let k = 0; k < 4; k++) {
      more.push(type((t += 5 * S), 1, String(k)));
      more.push(run((t += 5 * S), "TypeError"));
    }
    expect(nudgeDue("\n", more, t + S)).toBeNull();
    expect(nudgeDue("\n", more, 41 * S + 5 * MIN)).not.toBeNull();
  });

  it("알림 표시는 멈춤·작업 시간 계산에 들어가지 않고, 재생 타임라인에는 반응과 함께 보인다", () => {
    const log = [type(0, 0, "a"), [2 * MIN, "n:long-pause@0"], [2 * MIN + 5 * S, "n:open"], type(4 * MIN, 0, "b")];
    const a = analyzeLog("", log);
    expect(a.stats.pauseCount).toBe(1); // 0~4분 멈춤 하나 (알림이 멈춤을 둘로 나누지 않음)
    expect(a.marks.find((m) => m.kind === "nudge")!.detail).toBe("막힘 알림: 긴 멈춤 → 다시 봄");
    expect(summarizeProcess("", log).pauses).toHaveLength(1);
    expect(findStuckMoments("", log).filter((m) => m.rule === "long-pause")).toHaveLength(1);
  });

  it("다시 보기 구간: 멈춤이면 멈추기 전 2분, 나머지는 막힘 구간", () => {
    expect(nudgeRange({ ...currentStuck("", errLog)!, from: 10 * S, to: 30 * S })).toEqual({ from: 10 * S - 1, to: 30 * S });
    const pause = currentStuck("", [type(0, 0, "a")], 10 * MIN)!;
    expect(nudgeRange(pause)).toEqual({ from: -2 * MIN, to: 0 });
  });
});
