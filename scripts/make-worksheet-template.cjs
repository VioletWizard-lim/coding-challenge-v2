/**
 * 학습지 업로드(AI)용 워드 양식을 만든다: public/worksheet-template.docx
 * AI 학습지 읽기 지침(src/lib/ai.ts WORKSHEET_SYSTEM)이 기대하는 표 양식과 같게:
 *   제목 줄("2-1 문제 이름"), 난이도(★), 문제, 조건(번호 목록), 예시 입력·출력, 문제 목표, 도전 과제(경험자용)
 * 다시 만들기: node scripts/make-worksheet-template.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require("docx");

const FONT = "맑은 고딕";
const CODE_FONT = "Consolas";
// A4, 여백 2cm → 본문 너비 약 17cm = 9638 DXA
const TABLE_W = 9638;
const LABEL_W = 2400;
const BODY_W = TABLE_W - LABEL_W;
const LINE = { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF" };
const borders = { top: LINE, bottom: LINE, left: LINE, right: LINE };
const LABEL_FILL = "EEF2FF";
const HEAD_FILL = "C7D2FE";

const run = (text, opts = {}) => new TextRun({ text, font: opts.code ? CODE_FONT : FONT, size: opts.size ?? 21, bold: opts.bold, color: opts.color });
/** 여러 줄 글 → 줄마다 문단 (워드에서 \n은 쓰지 않는다) */
// keepNext: 표 하나(문제 하나)가 두 쪽으로 나뉘지 않게
const lines = (text, opts = {}) =>
  String(text)
    .split("\n")
    .map((l) => new Paragraph({ keepNext: true, spacing: { before: 20, after: 20 }, children: [run(l, opts)] }));

const cell = (children, width, fill) =>
  new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    ...(fill ? { shading: { fill, type: ShadingType.CLEAR, color: "auto" } } : {}),
    children,
  });

const row = (label, body) =>
  new TableRow({
    cantSplit: true,
    children: [cell([new Paragraph({ keepNext: true, children: [run(label, { bold: true })] })], LABEL_W, LABEL_FILL), cell(body, BODY_W)],
  });

/** 문제 하나 = 표 하나 */
function problemTable(p) {
  const stars = "★".repeat(p.difficulty) + "☆".repeat(5 - p.difficulty);
  const rows = [
    new TableRow({
      children: [
        new TableCell({
          borders,
          columnSpan: 2,
          width: { size: TABLE_W, type: WidthType.DXA },
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          shading: { fill: HEAD_FILL, type: ShadingType.CLEAR, color: "auto" },
          children: [new Paragraph({ keepNext: true, children: [run(`${p.number} ${p.title}`, { bold: true, size: 26 })] })],
        }),
      ],
    }),
    row("난이도", [new Paragraph({ keepNext: true, children: [run(stars, { color: "D97706", size: 24 })] })]),
    row("차시", lines(p.lesson)),
    row("차시 안 순서", lines(p.order)),
    row("기본/심화", lines(p.level)),
    row("앵커(기준 문제)", lines(p.anchor ? "O" : " ")),
    row("성취기준", lines(p.standards)),
    row("문제", lines(p.description)),
    row(
      "조건",
      p.conditions.map((c) => new Paragraph({ keepNext: true, numbering: { reference: "conditions", level: 0, instance: p.instance }, children: [run(c)] })),
    ),
    ...p.examples.flatMap((e, i) => [
      row(`예시 ${i + 1} 입력`, lines(e.input || " ", { code: true })),
      row(`예시 ${i + 1} 출력`, lines(e.output, { code: true })),
    ]),
    row("문제 목표", lines(p.goal)),
    row("도전 과제 (경험자용)", lines(p.challenge || " ")),
  ];
  return new Table({ width: { size: TABLE_W, type: WidthType.DXA }, columnWidths: [LABEL_W, BODY_W], rows });
}

const PROBLEMS = [
  {
    instance: 1,
    number: "2-1",
    title: "내 나이 두 배",
    difficulty: 1,
    lesson: "2",
    order: "1",
    level: "기본",
    anchor: false,
    standards: "12정03-04",
    description: "나이를 정수로 입력받아, 그 두 배를 출력하는 프로그램을 만드세요.",
    conditions: ["input()을 한 번 사용할 것", "int()로 정수로 바꿀 것", "예시와 같은 형태로 출력할 것"],
    examples: [
      { input: "17", output: "34" },
      { input: "5", output: "10" },
    ],
    goal: "입력값을 정수로 바꿔 계산할 수 있다.",
    challenge: "세 배, 네 배도 한 줄씩 함께 출력해 보세요.",
  },
  {
    instance: 2,
    number: "2-2",
    title: "급식 추천 카드",
    difficulty: 3,
    lesson: "2",
    order: "2",
    level: "심화",
    anchor: true,
    standards: "12정03-04 12정03-05",
    description: "이름, 반찬, 밥 종류를 차례로 입력받아 급식 추천 카드를 출력하세요.",
    conditions: ["input()을 3번 사용할 것", "구분선(===)을 넣어 예시와 같은 형태로 출력할 것"],
    examples: [
      { input: "길동 / 돈까스 / 볶음밥", output: "=== 급식 추천 카드 ===\n이름: 길동\n추천 메뉴: 볶음밥 + 돈까스" },
      { input: "영희 / 제육볶음 / 흑미밥", output: "=== 급식 추천 카드 ===\n이름: 영희\n추천 메뉴: 흑미밥 + 제육볶음" },
    ],
    goal: "여러 입력값을 문자열로 이어 원하는 형태로 출력할 수 있다.",
    challenge: "",
  },
];

const guide = [
  "Line by Line 학습지 양식 (학습지 업로드(AI)용)",
  "· 문제 하나에 표 하나예요. 문제를 더 넣으려면 표를 통째로 복사해서 아래에 붙이고 내용을 바꿔 주세요. 예시 문제 두 개는 지우거나 고쳐 쓰세요.",
  "· 제목 줄은 '2-1 문제 이름'처럼 단원-번호를 먼저 적어요. 난이도는 채운 별(★) 개수로 읽어요(☆는 빈 별).",
  "· 예시 입력이 여러 개면 '길동 / 돈까스 / 볶음밥'처럼 / 로 나눠 한 줄에 적거나, 한 줄에 하나씩 적어요. 입력이 없는 문제는 입력 칸을 비워 두세요. 예시가 더 필요하면 '예시 입력·출력' 두 줄을 복사해 '예시 3'으로 바꿔요.",
  "· 수업 계획 칸(차시~성취기준)은 비워도 돼요. 차시와 순서만 적으면 성취기준·기본/심화·앵커는 사이트가 정해진 규칙으로 미리 채워요(나중에 고칠 수 있어요). 앵커는 차시의 마지막(가장 어려운) 문제에 O를 적어요.",
  "· 성취기준 코드: [12정03-01] 문제 분해·모델링, [12정03-04] 자료형, [12정03-05] 입출력, [12정03-06] 다차원 데이터 구조, [12정03-07] 제어 구조 복합 활용 (여러 개면 띄어 쓰기)",
  "· 도전 과제가 없으면 칸을 비워 두세요. 이 안내 글은 지우지 않아도 돼요(AI가 문제로 읽지 않아요).",
];

const children = [
  new Paragraph({ spacing: { after: 120 }, children: [run(guide[0], { bold: true, size: 30 })] }),
  ...guide.slice(1).map((g) => new Paragraph({ spacing: { after: 60 }, children: [run(g, { size: 19, color: "4B5563" })] })),
  new Paragraph({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C7D2FE", space: 4 } }, children: [] }),
];
PROBLEMS.forEach((p, i) => {
  children.push(problemTable(p));
  children.push(new Paragraph({ spacing: { after: i < PROBLEMS.length - 1 ? 360 : 0 }, children: [] }));
});

const doc = new Document({
  creator: "Line by Line",
  title: "학습지 양식",
  styles: { default: { document: { run: { font: FONT, size: 21 } } } },
  numbering: {
    config: [
      {
        reference: "conditions",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 300 } } } }],
      },
    ],
  },
  sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }],
});

const out = path.join(__dirname, "..", "public", "worksheet-template.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log("만듦:", out);
});
