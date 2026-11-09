import { describe, expect, it } from "vitest";
import { csvLine, decodeCell, encodeCell, kindOf, parseCsv, rowsFromCsv } from "./backupCsv";
import { crc32, readZip, zipStream } from "./zip";

describe("백업 CSV", () => {
  it("null과 빈 글, 따옴표·쉼표·줄바꿈을 구분해 그대로 되살린다", () => {
    const row = { a: null, b: "", c: 'say "hi", ok\nnext', d: 3, e: true, f: [[1, "i", 0, 0, 0, 0, "x"]], g: "=SUM(A1)", h: "'따옴표로 시작", i: "-1" };
    const kinds = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, kindOf(v) ?? "string"]));
    const text = "﻿" + csvLine(Object.keys(row)) + csvLine(Object.values(row));
    expect(rowsFromCsv(text, kinds)).toEqual([row]);
  });

  it("엑셀에서 수식으로 실행될 글은 앞에 ' 가 붙는다", () => {
    expect(encodeCell("=1+1")).toBe("'=1+1");
    expect(encodeCell("+82")).toBe("'+82");
    expect(encodeCell(-5)).toBe("-5");
    expect(decodeCell("'=1+1", "string")).toBe("=1+1");
  });

  it("빈 칸과 마지막 빈 칸", () => {
    expect(parseCsv('a,b,c\r\n1,,""\r\n2,x,\r\n')).toEqual([
      ["a", "b", "c"],
      ["1", null, ""],
      ["2", "x", null],
    ]);
  });
});

describe("ZIP", () => {
  it("만든 ZIP을 다시 읽으면 같은 내용 (한글 이름, 여러 조각)", async () => {
    const e = new TextEncoder();
    async function* entries() {
      yield { name: "제출.csv", data: [e.encode("a,b\r\n"), e.encode("1,2\r\n")] };
      yield { name: "빈.csv", data: [] as Uint8Array[] };
    }
    const buf = await new Response(zipStream(entries())).arrayBuffer();
    const files = readZip(buf);
    expect([...files.keys()]).toEqual(["제출.csv", "빈.csv"]);
    expect(new TextDecoder().decode(files.get("제출.csv"))).toBe("a,b\r\n1,2\r\n");
    expect(files.get("빈.csv")!.length).toBe(0);
  });

  it("CRC32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});
