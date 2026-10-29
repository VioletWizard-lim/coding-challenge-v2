import { describe, expect, it } from "vitest";
import { decodeCsvFile, parseCsv, parseStudentCsv, resultCsv, TEMPLATE_CSV } from "./studentCsv";

describe("CSV 읽기", () => {
  it("따옴표 안의 쉼표·줄바꿈·따옴표, CRLF, BOM, 빈 줄을 처리한다", () => {
    const text = '﻿a,b\r\n"1,2","x ""y""\nz"\r\n\r\n3,\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["1,2", 'x "y"\nz'],
      ["3", ""],
    ]);
  });
  it("EUC-KR 파일도 읽는다", () => {
    // "학번" (EUC-KR)
    const euckr = new Uint8Array([0xc7, 0xd0, 0xb9, 0xf8]).buffer;
    expect(decodeCsvFile(euckr)).toBe("학번");
    expect(decodeCsvFile(new TextEncoder().encode("학번").buffer)).toBe("학번");
  });
});

describe("학생 CSV 검사", () => {
  it("양식 파일은 오류 없이 읽힌다", () => {
    const { rows, error } = parseStudentCsv(TEMPLATE_CSV);
    expect(error).toBeNull();
    expect(rows.map((r) => r.error)).toEqual([null, null]);
    expect(rows[0].student).toEqual({
      id: "20301",
      name: "홍길동",
      grade: 2,
      class: 3,
      programmingGrade: 2,
      programmingClass: 5,
      subjects: "프로그래밍,정보",
      password: "",
    });
    expect(rows[1].student.subjects).toBe("정보");
    expect(rows[1].student.password).toBe("abcd1234");
  });

  it("제목 줄의 띄어쓰기·순서가 달라도 되고, 없는 칸은 비워 둔다", () => {
    const { rows } = parseStudentCsv("이름, 학 번\n홍길동,30101\n");
    expect(rows[0].student).toMatchObject({ id: "30101", name: "홍길동", grade: null, subjects: null, password: "" });
    expect(rows[0].error).toBeNull();
  });

  it("학번·이름 제목이 없으면 파일 전체를 거부", () => {
    expect(parseStudentCsv("번호,성명\n1,홍길동").error).toMatch("학번");
  });

  it.each([
    ["학번이 비어 있음", ",홍길동", "학번이 비어"],
    ["학번에 공백", "20 301,홍길동", "영문·숫자"],
    ["이름이 비어 있음", "20301,", "이름이 비어"],
    ["학년이 숫자가 아님", "20301,홍길동,2학년", "숫자로"],
    ["없는 과목", "20301,홍길동,2,3,국어", "'국어' 과목이 없어요"],
    ["짧은 비밀번호", "20301,홍길동,2,3,,12", "4~72자"],
    ["비밀번호 앞뒤 공백", "20301,홍길동,2,3,, abcd", "공백"],
  ])("%s → 그 줄만 오류", (_, line, message) => {
    const { rows } = parseStudentCsv(`학번,이름,학년,반,과목,초기 비밀번호\n${line}\n20399,정상,2,3,,\n`);
    expect(rows[0].error).toContain(message);
    expect(rows[1].error).toBeNull();
  });

  it("파일 안의 중복 학번은 두 번째부터 오류", () => {
    const { rows } = parseStudentCsv("학번,이름\n1,가\n1,나\n");
    expect(rows.map((r) => r.error)).toEqual([null, "파일 안에 같은 학번이 또 있어요."]);
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
  });

  it("300명이 넘으면 거부", () => {
    const text = "학번,이름\n" + Array.from({ length: 301 }, (_, i) => `${i},학생`).join("\n");
    expect(parseStudentCsv(text).error).toMatch("300명");
  });
});

describe("결과 CSV", () => {
  it("BOM을 붙이고 쉼표가 든 값은 따옴표로 감싼다", () => {
    expect(resultCsv([{ id: "1", name: "홍,길동", password: "012345" }])).toBe(
      '﻿학번,이름,비밀번호\n1,"홍,길동",012345\n',
    );
  });
});

describe("이미 있는 아이디", () => {
  const csv = (subjects: string | null, name = "홍길동") => ({
    id: "s203011234",
    name,
    grade: 2,
    class: 3,
    programmingGrade: null,
    programmingClass: null,
    subjects,
    password: "",
  });
  const acc = (subjects: string | null, name = "홍길동", role = "student") => ({ name, role, subjects });
  it("같은 학생이면 새 과목만 더한다", async () => {
    const { planForExisting } = await import("./studentCsv");
    expect(planForExisting(csv("프로그래밍"), acc("정보"))).toEqual({ kind: "add", add: ["프로그래밍"], next: "정보,프로그래밍" });
    expect(planForExisting(csv("정보"), acc("정보,프로그래밍"))).toEqual({ kind: "same" });
    expect(planForExisting(csv(null), acc("정보"))).toEqual({ kind: "add", add: ["프로그래밍"], next: "정보,프로그래밍" });
    expect(planForExisting(csv("프로그래밍"), acc(null))).toEqual({ kind: "same" }); // 이미 모든 과목
  });
  it("이름이 다르거나 교사 계정이면 건드리지 않는다", async () => {
    const { planForExisting } = await import("./studentCsv");
    expect(planForExisting(csv("정보", "김철수"), acc("정보")).kind).toBe("conflict");
    expect(planForExisting(csv("정보"), acc(null, "홍길동", "teacher")).kind).toBe("conflict");
  });
});
