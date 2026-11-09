import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/components/Logo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `개인정보·AI 이용 안내 · ${SITE.name}`,
  description: "Line by Line이 어떤 정보를 저장하고, AI를 어떻게 쓰며, 학생(미성년자)을 어떻게 보호하는지 안내합니다.",
};

/** 고칠 때: 실제 동작(src/lib/ai.ts, 저장하는 표들)과 다른 내용이 생기지 않게 함께 고친다 */
const UPDATED = "2026년 11월 9일";

/**
 * 개인정보·AI 이용 안내 (CLAUDE.md "보안": 개인정보·미성년자 보호 준수 내용을 사이트 안내 페이지에 공개한다).
 * 로그인하지 않아도 볼 수 있는 정적 페이지. 로그인 화면과 모든 화면 아래쪽에서 들어온다.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link href="/" className="flex items-center gap-2 self-start font-black">
          <Logo className="h-7 w-7" />
          {SITE.name}
        </Link>
        <h1 className="text-3xl font-black">개인정보·AI 이용 안내</h1>
        <p className="text-muted">
          {SITE.name}({SITE.nameKo})은 학교 정보 수업에서 학생이 코드를 <b>어떻게</b> 써 왔는지 기록하고 스스로 돌아보게 돕는 수업 도구예요.
          이 페이지는 어떤 정보를 왜 저장하는지, AI에 무엇을 보내는지, 학생을 어떻게 보호하는지 알려 드려요.
        </p>
        <p className="text-xs text-muted">마지막으로 고친 날: {UPDATED}</p>
      </div>

      <Box title="한눈에 보기" tone="brand">
        <ul className="list-disc pl-5">
          <li>선생님이 만든 계정으로 로그인한 학생만 쓸 수 있어요. 광고나 외부 계정 로그인은 없어요.</li>
          <li>
            AI에는 <b>학생 이름과 학번(아이디)을 보내지 않아요.</b> 문제와 코드, 작성 과정 요약만 보내요.
          </li>
          <li>모든 AI 답에는 &ldquo;AI가 만든 답변입니다&rdquo;가 붙어 있고, 선생님은 학생의 AI 대화를 볼 수 있어요.</li>
          <li>작성 기록은 감시가 아니라 성찰을 위한 것이에요. 붙여넣기나 다른 창 이동으로 점수를 깎지 않아요.</li>
        </ul>
      </Box>

      <Section title="1. 어떤 정보를 저장하나요?">
        <Table
          rows={[
            ["계정", "아이디(학번), 이름, 학년·반, 듣는 과목, 비밀번호", "로그인, 반별로 모아 보기. 비밀번호는 암호화(해시)해서 저장해요. 예전 수업 사이트와 함께 쓰는 동안은 그 사이트의 방식으로도 저장돼요."],
            ["제출", "코드, 코드 설명, 제출 시각, 선생님의 점수·피드백", "수업 과제 확인과 평가"],
            [
              "작성 기록",
              "코드를 쓰는 동안의 입력·지우기·붙여넣기, 다른 창으로 갔다 온 시각, 실행 결과(성공·오류 이름), AI 도움을 요청한 시각",
              "재생 타임라인, 나의 학습 여정, 업적, AI가 과정을 근거로 돕기. 화면 내용이나 다른 프로그램은 기록하지 않아요.",
            ],
            ["돌아보기", "오늘의 성찰, 타임라인 메모, 선생님 피드백 메모, 본 업적 목록", "성찰과 피드백"],
            ["직접 만든 문제", "연습 모드에서 학생이 만든 문제·예시·답, 답을 쓴 과정, 친구 문제를 푼 기록", "나만 풀기 또는 선생님 승인 후 같은 반 친구와 풀기. 친구에게는 만든 학생의 이름과 답을 보여 주지 않아요."],
            ["AI 사용", "AI 도우미 질문과 답, AI 되돌아보기 질문과 학생 답, 연습 문제와 푼 기록, 이상한 답 알리기", "선생님 열람(미성년자 보호), 하루 사용 횟수 세기, 비용 확인"],
          ]}
        />
        <p>
          작성 중인 코드는 새로고침해도 사라지지 않게 <b>내 브라우저(localStorage)</b>에도 저장돼요. 공용 컴퓨터라면 다 쓴 뒤 로그아웃해
          주세요. 로그인 상태는 서명된 쿠키 하나로만 유지해요.
        </p>
      </Section>

      <Section title="2. 누가 볼 수 있나요?">
        <ul className="list-disc pl-5">
          <li>
            <b>학생</b>: 내 제출, 내 작성 기록, 내 AI 대화만 볼 수 있어요.
          </li>
          <li>
            <b>선생님</b>: 수업을 위해 학생들의 제출, 작성 기록, 성찰, AI 대화를 볼 수 있어요.
          </li>
          <li>
            <b>관리자</b>: 선생님 계정을 만들고 관리해요.
          </li>
        </ul>
        <p>저장된 정보는 수업 밖의 목적으로 쓰거나 다른 곳에 팔거나 넘기지 않아요.</p>
      </Section>

      <Section title="3. AI는 어떻게 쓰나요?">
        <p>
          AI는 Anthropic의 <b>Claude</b>를 서버에서만 불러서 써요. 학생이 쓰는 AI 기능에는 만 18세 미만 사용을 허용하지 않는 AI(예:
          Gemini)를 쓰지 않아요.
        </p>
        <Table
          head={["기능", "누가", "AI에 보내는 것"]}
          rows={[
            ["🤖 AI 도우미", "학생, 코드 작성 중", "문제, 내 작성 과정 요약(마지막으로 성공한 코드, 그 뒤 바뀐 줄, 반복된 오류, 멈춘 구간), 질문, 같은 문제의 최근 대화 3개"],
            ["🔁 AI 되돌아보기", "학생, 제출 뒤", "문제, 최종 코드, 작성 과정 요약 (이어 묻기를 누르면 그 질문과 학생 답도)"],
            ["🧪 연습 문제 만들기", "학생", "선생님이 정한 문법 범위, 고른 개념, 최근 제출에서 막혔던 곳(오류 종류·횟수, 그때의 코드, 문제 번호와 제목)"],
            ["📝 AI 채점 초안", "선생님", "문제, 채점 기준, 학생 코드와 코드 설명, 작성 과정 요약. 점수는 선생님이 확인해서 정해요."],
            ["📄 학습지 업로드", "선생님", "올린 학습지 파일. 문제만 옮겨 적고, 파일은 저장하지 않아요."],
            ["🧪 체험 페이지(/try)", "체험 코드를 받은 방문자(심사위원 등)", "체험 문제, 체험하며 쓴 작성 과정 요약, 질문·답. 로그인이 없고, 쓴 코드와 대화는 서버에 저장하지 않아요(하루 사용 횟수와 토큰 수만 남겨요)."],
          ]}
        />
        <ul className="list-disc pl-5">
          <li>
            어느 기능이든 <b>학생 이름, 학번(아이디), 반은 보내지 않아요.</b> 코드나 질문에 학생이 직접 개인정보를 적으면 그대로 갈 수
            있으니, 이름·전화번호 같은 것은 쓰지 말아 주세요.
          </li>
          <li>AI는 정답이나 완성 코드를 주지 않고, 내가 써 온 과정을 근거로 어디를 보면 좋을지 알려 줘요. AI의 답은 틀릴 수 있어요.</li>
          <li>
            Anthropic이 API로 받은 내용을 어떻게 다루는지는{" "}
            <a href="https://www.anthropic.com/legal/privacy" className="font-bold text-brand underline" target="_blank" rel="noreferrer">
              Anthropic 개인정보 처리방침
            </a>
            에서 볼 수 있어요.
          </li>
          <li>AI 비용을 관리하려고 학생마다 하루에 쓸 수 있는 횟수를 정해 두었어요.</li>
        </ul>
      </Section>

      <Section title="4. 학생(미성년자) 보호">
        <ul className="list-disc pl-5">
          <li>선생님이 만든 계정으로 로그인한 학생만 AI 기능을 쓸 수 있어요.</li>
          <li>
            모든 AI에는 안전 지침이 들어 있어요. 수업과 상관없는 요청(다른 과목 숙제, 잡담, 성적인 내용, 폭력, 위험한 행동, 해킹 등)은 거절하고,
            학생의 개인정보를 묻지 않아요.
          </li>
          <li>
            학생이 힘들다는 신호를 보이면 AI는 공부 이야기를 멈추고 선생님이나 믿을 수 있는 어른과 이야기하도록 권하고, 상담 전화를
            알려 줘요: <b>청소년상담 1388</b>, <b>자살예방 상담전화 109</b>(24시간).
          </li>
          <li>모든 AI 답과 질문, 연습 문제에는 &ldquo;AI가 만든 …입니다&rdquo; 표시가 붙어 있어요.</li>
          <li>
            이상하거나 불편한 답은 <b>🚩 이상한 답 알리기</b>로 선생님께 알릴 수 있어요. 선생님은 학생의 AI 대화를 보고 부적절한 대화를
            🚩로 표시해요.
          </li>
        </ul>
      </Section>

      <Section title="5. 어디에 저장되나요?">
        <p>
          화면은 Vercel에서, 정보는 Supabase 데이터베이스에 저장돼요. 데이터베이스에는 서버만 접근할 수 있고, 접속 키는 브라우저에 보내지
          않아요.
        </p>
      </Section>

      <Section title="6. 보관과 삭제, 문의">
        <p>
          <b>학생 기록</b>(계정, 제출한 코드·작성 기록·점수·피드백, AI 대화·되돌아보기, 오늘의 성찰, 타임라인 메모, 연습 문제, 직접 만든 문제)은 <b>그
          학년도가 끝나는 다음 해 2월 말까지</b> 보관하고, 그 뒤에 <b>모두 지워요</b>. 예: 2026학년도(2026년 3월~2027년 2월) 기록은 2027년 2월 말까지. 지우기
          전에 선생님이 전체 백업을 받아 학교 규정에 맞게 보관하고, <b>이름·아이디 없이 숫자만 담은 통계</b>(반·월별 제출 수, 직접 작성 비율, 성찰 수 등)는
          수업 연구와 보고서에 써요. 학생은 지워지기 전에 💭 오늘의 성찰 화면에서 <b>내 성찰을 CSV로 내려받아</b> 간직할 수 있어요. 내 정보를 보고
          싶거나, 고치거나 지우고 싶으면 <b>담당 선생님</b>께 말씀해 주세요. 비밀번호를 잊었을 때도 선생님이 다시 정해 줘요.
        </p>
      </Section>

      <p className="text-center text-sm">
        <Link href="/" className="font-bold text-brand hover:underline">
          ← 처음 화면으로
        </Link>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5 leading-7">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Box({ title, children, tone }: { title: string; children: ReactNode; tone: "brand" }) {
  return (
    <section className={`flex flex-col gap-2 rounded-xl border p-5 leading-7 ${tone === "brand" ? "border-brand/30 bg-brand-soft" : ""}`}>
      <h2 className="font-bold text-brand">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head = ["무엇", "자세히", "왜"], rows }: { head?: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="bg-page text-left">
            {head.map((h) => (
              <th key={h} className="border border-line px-3 py-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="align-top">
              {r.map((c, i) => (
                <td key={i} className={`border border-line px-3 py-2 ${i === 0 ? "whitespace-nowrap font-bold" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
