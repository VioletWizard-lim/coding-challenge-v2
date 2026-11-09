import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/components/Logo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `선생님용 사용 안내 · ${SITE.name}`,
  description: "Line by Line을 수업에 쓰는 방법: 학생 등록, 문제 올리기, 수업 흐름, 채점, AI 기능 설정",
};

/**
 * 선생님용 사용 안내. 로그인하지 않아도 볼 수 있는 정적 페이지 (다른 선생님에게 소개할 때도 씀).
 * 화면 이름·버튼 이름을 바꾸면 여기도 함께 고친다.
 */
const SECTIONS = [
  ["idea", "이 사이트는 무엇인가요"],
  ["start", "1. 처음 준비"],
  ["problems", "2. 문제 올리기"],
  ["class", "3. 수업 흐름"],
  ["grading", "4. 채점"],
  ["process", "5. 과정 살펴보기"],
  ["ai", "6. AI 기능과 안전"],
  ["practice", "7. 연습 모드와 학생이 만든 문제"],
  ["faq", "자주 묻는 질문"],
] as const;

export default function GuidePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link href="/" className="flex items-center gap-2 self-start font-black">
          <Logo className="h-7 w-7" />
          {SITE.name}
        </Link>
        <h1 className="text-3xl font-black">선생님용 사용 안내</h1>
        <p className="text-muted">처음 쓰시는 선생님이 수업 한 차시를 운영할 수 있도록 순서대로 정리했어요.</p>
        <nav aria-label="차례" className="mt-2 flex flex-wrap gap-1.5">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-line bg-white px-3 py-1 text-sm hover:border-brand hover:text-brand">
              {label}
            </a>
          ))}
        </nav>
      </div>

      <Section id="idea" title="이 사이트는 무엇인가요">
        <p>
          학생이 코드를 <b>어떻게 써 왔는지</b>(입력, 지우기, 붙여넣기, 실행 결과, 멈춘 시간, AI에게 물어본 순간)를 기록하고, 학생과 선생님이 그 과정을
          다시 보며 돌아보는 수업 도구예요. 결과보다 과정을, 감시보다 성찰을 중심에 둬요. 붙여넣기나 다른 창 이동으로 점수를 깎는 기능은 없어요.
        </p>
        <Flow />
      </Section>

      <Section id="start" title="1. 처음 준비">
        <Steps
          items={[
            <>
              <b>선생님 계정</b>은 관리자가 만들어요(관리자 페이지 → 교사 계정 추가). 처음 받은 임시 비밀번호로 로그인하세요.
            </>,
            <>
              <b>🏫 학생 관리</b> → &ldquo;CSV로 학생 일괄 등록&rdquo;에서 <b>양식 파일을 내려받아</b> 학번, 이름, 학년, 반, 과목, 초기 비밀번호를 채워
              올려요. 미리보기에서 확인한 뒤 등록돼요. 이미 있는 학번은 건너뛰고 알려 줘요.
            </>,
            <>
              학생이 비밀번호를 잊으면 같은 화면에서 <b>비밀번호 초기화</b>를 눌러 새 비밀번호를 알려 주세요.
            </>,
            <>
              <b>⚙️ 설정</b>에서 과목별 <b>AI 기능</b>, <b>채점 기준</b>, <b>연습 모드 범위</b>를 한 번 정해 두세요(정하지 않으면 기본값으로 동작해요).
            </>,
          ]}
        />
      </Section>

      <Section id="problems" title="2. 문제 올리기">
        <Steps
          items={[
            <>
              <b>📚 문제 관리</b>에서 문제를 하나씩 쓰거나, CSV로 여러 개를 올리거나, <b>학습지 업로드(AI)</b>로 PDF·워드·사진 학습지에서 문제를 옮겨
              적을 수 있어요. 학습지 파일은 저장하지 않아요.
            </>,
            <>
              문제 양식: 번호(예: 2-3), 제목, 난이도(별), 문제, 조건, 예시 입력·출력, 문제 목표, 도전 과제, 시작 코드.
            </>,
            <>
              <b>공개 시각</b>을 정하면 그 시각부터 학생에게 보여요. 수업 시작 시각으로 미리 예약해 두면 편해요. 공개 전 문제는 학생에게 제목도 보이지
              않아요.
            </>,
          ]}
        />
      </Section>

      <Section id="class" title="3. 수업 흐름 (작성 → 재생 → 되돌아보기 → 성찰)">
        <Steps
          items={[
            <>
              <b>작성</b>: 학생은 📝 코드 작성에서 문제를 고르고 코드를 써서 실행해요. 막히면 <b>🤖 AI 도우미</b>에게 물어요. AI는 학생이 써 온
              과정(마지막으로 성공한 코드, 반복된 오류, 오래 멈춘 곳)을 보고 힌트를 주고, 정답 코드는 주지 않아요. 코드 설명을 쓰고 제출해요.
            </>,
            <>
              <b>재생</b>: 제출 뒤 ▶ 내 기록 다시 보기에서 자기 작성 과정을 타임라인으로 다시 봐요. 막힌 순간에 📌 메모를 남길 수 있어요.
            </>,
            <>
              <b>되돌아보기</b>: 재생기 아래 &ldquo;🤖 AI와 되돌아보기&rdquo;를 누르면 AI가 과정의 특정 순간을 짚어 질문 2~3개를 하고, 학생이 답을
              적어요. 답을 저장한 뒤 &ldquo;🤖 AI에게 내 답 보여 주기&rdquo;를 누르면 AI가 학생 답과 과정을 함께 보고 짧게 반응한 뒤 한 번 더
              물어요(질문마다 한 번, 하루 AI 사용 횟수에 함께 세요).
            </>,
            <>
              <b>성찰</b>: 수업 끝에 💭 오늘의 성찰(가장 어려웠던 문제, AI에게 질문한 내용, 오늘 배운 핵심 개념)을 써요. 학생은 🧭 나의 학습
              여정에서 날짜별 기록과 성장을 보고, 🏅 업적으로 칭찬을 받아요.
            </>,
          ]}
        />
        <Tip>
          처음 화면(🏠)에서 오늘 제출한 학생 수, 성찰 쓴 학생 수, 많이 푼 문제, 채점 대기를 한눈에 볼 수 있어요. 바로 가기 버튼으로 각 화면에 들어가요.
        </Tip>
      </Section>

      <Section id="grading" title="4. 채점">
        <Steps
          items={[
            <>
              <b>⚙️ 설정 → 채점 기준</b>에서 과목마다 영역 이름·배점·설명을 정해요(기본: 기능 40 · 코드 설명 40 · 도전 20). 설명에 감점 규칙(예:
              &ldquo;조건 하나 빠질 때마다 -5&rdquo;)을 적어 두면 AI 채점 초안도 그대로 따라요.
            </>,
            <>
              <b>📝 채점</b>에서 과목·반·문제·이름으로 고르고, &ldquo;미채점만&rdquo;을 켜서 영역별 점수와 감점 이유를 써요. 바꾼 채점은 &ldquo;💾 바뀐 채점 모두
              저장&rdquo;으로 한꺼번에 저장해요. 점수가 0이면 오답 처리도 할 수 있어요.
            </>,
            <>
              <b>🤖 AI 채점 초안</b>은 채점 기준·코드·코드 설명·작성 과정을 보고 점수와 이유의 초안을 칸에 채워 줘요. 저장은 선생님이 확인한 뒤에만
              돼요. 작성 과정(붙여넣기 등)으로는 감점하지 않아요.
            </>,
            <>
              <b>📊 반별 현황</b>에서 반별 점수표와 작성 통계를 보고 CSV로 내려받을 수 있어요(익명 ID 옵션).
            </>,
            <>
              <b>📈 수업 효과</b>: 이름 없이 숫자만 모아 월별 변화(직접 작성 비율, 오류를 스스로 고쳐 다시 성공, 성찰 작성률, 제출당 작업 시간)와 새
              사이트 도입 전후를 보여 줘요. 보고서·연구 자료로 캡처하거나 CSV로 받으세요. 학년도 말 정리로 기록을 지운 해도 남겨 둔 통계로 계속 보여요.
            </>,
          ]}
        />
      </Section>

      <Section id="process" title="5. 과정 살펴보기">
        <Steps
          items={[
            <>
              <b>🧭 학생별 학습 여정</b>: 학생 한 명이 본 화면과 같은 학습 여정을 보고, 제출마다 &ldquo;과정 보기&rdquo;로 재생해요. 재생의 그 순간에
              💬 피드백을 남기면 학생도 자기 재생에서 봐요.
            </>,
            <>
              <b>💭 성찰 모아보기</b>: 날짜·과목·반별로 학생들의 오늘의 성찰을 모아 봐요.
            </>,
            <>
              재생 타임라인 표시: ▼ 붙여넣기, ◇ 다른 창으로 이동, ● 실행 성공, ✕ 실행 오류, ⏸ 1분 넘게 멈춤, ✂ 크게 지움, ? AI 도움 요청. 흑백 인쇄에서도 모양으로
              구분돼요. 이 표시는 <b>살펴볼 곳</b>이지 감점 근거가 아니에요.
            </>,
          ]}
        />
      </Section>

      <Section id="ai" title="6. AI 기능과 안전">
        <Steps
          items={[
            <>
              <b>⚙️ 설정 → 🤖 AI 기능</b>: 과목마다 AI 도우미·AI 되돌아보기를 켜고 끌 수 있어요. <b>수행평가 단원</b>은 단원 버튼을 눌러 그 단원만 AI
              도우미를 끄세요. 선생님 지침(예: &ldquo;f-string은 아직 안 배웠어요&rdquo;)도 AI에 함께 전해져요.
            </>,
            <>
              <b>🤖 AI 대화</b>: 학생의 AI 도우미 대화, 되돌아보기, 연습 문제를 모두 볼 수 있어요. 학생이 &ldquo;🚩 이상한 답 알리기&rdquo;를 누른 대화도
              여기 보여요. 부적절한 대화는 🚩로 표시해 두세요. AI 답 속의 파란 순간 버튼(⏪)을 누르면 그 대화가 나온 제출(연습 문제는 풀이
              기록)의 재생이 그 순간부터 열려서, AI가 무엇을 근거로 답했는지 바로 확인할 수 있어요.
            </>,
            <>
              AI에는 학생 이름·학번을 보내지 않아요. 학생 AI는 미성년자 사용이 허용된 Claude를 쓰고, 수업 밖 요청은 거절하도록 안전 지침이 들어 있어요.
              자세한 내용은{" "}
              <Link href="/privacy" className="font-bold text-brand underline">
                개인정보·AI 이용 안내
              </Link>
              에 있어요.
            </>,
            <>
              비용 관리: 학생마다 하루 AI 질문 50번, 연습 문제 만들기 7개. 처음 화면 <b>🤖 AI 사용량</b> 카드에서 오늘·이번 달 사용량과 예상 비용을 봐요.
            </>,
          ]}
        />
      </Section>

      <Section id="practice" title="7. 연습 모드와 학생이 만든 문제">
        <Steps
          items={[
            <>
              학생은 <b>🧪 연습 모드</b>에서 자기 작성 기록의 <b>막혔던 곳</b>(여러 번 난 오류, 오래 멈춘 문제)이나 개념을 골라 AI에게 연습 문제를 받아요.
              AI가 만든 참고 답안을 서버에서 실제로 돌려 맞는 문제만 줘요. 선생님은 ⚙️ 설정 → 연습 모드에서 쓸 수 있는 개념(문법 범위)을 정해요.
            </>,
            <>
              <b>직접 만든 문제</b>: 학생이 문제·예시·자기 답을 만들고, &ldquo;나만 풀기&rdquo; 또는 &ldquo;선생님 승인 후 반 친구와 풀기&rdquo;를 골라요.
              <b> ✏️ 학생이 만든 문제</b>에서 학생 답으로 예시를 확인하고, 답을 쓴 과정을 재생해 본 뒤 승인하거나 고쳐 달라고 해 주세요.
            </>,
            <>수업 활동 예: &ldquo;오늘 배운 개념으로 친구가 풀 문제 하나 만들기&rdquo; → 선생님 승인 → 다음 시간에 서로 풀기.</>,
          ]}
        />
      </Section>

      <Section id="faq" title="자주 묻는 질문">
        <Faq q="학생이 쓰던 코드가 사라졌어요.">
          작성 중인 코드는 학생 브라우저에 저장돼요. 같은 컴퓨터·같은 브라우저로 들어오면 그대로 있어요. 다른 컴퓨터로 옮기면 보이지 않으니, 수업 끝에는
          제출하도록 안내해 주세요(연습 모드는 &ldquo;확인하기&rdquo;를 누를 때 서버에도 저장돼요).
        </Faq>
        <Faq q="붙여넣기를 많이 한 학생은 어떻게 하나요?">
          점수를 깎지 않아요. 재생으로 어떤 내용을 붙여넣었는지(AI 답에서 왔는지) 보고, 학생과 함께 이야기하는 데 쓰세요. 📊 반별 현황의 붙여넣기 비율은
          &ldquo;살펴볼 값&rdquo;이에요.
        </Faq>
        <Faq q="수업 밖 사람(심사위원·다른 선생님)에게 보여 주려면요?">
          첫 화면의 &ldquo;🧪 로그인 없이 체험해 보기&rdquo;(<code>/try</code>)를 안내하세요. 로그인 없이 코드 쓰기 → 재생하며 AI와 되돌아보기 → 성찰을
          체험하고, 예시 학생의 기록도 볼 수 있어요. 체험 내용은 저장하지 않아요. 진짜 AI는 <b>체험 코드</b>(Vercel 환경변수{" "}
          <code>TRY_ACCESS_CODE</code>)를 넣어야 쓸 수 있고, 사이트 전체 하루 횟수(<code>TRY_AI_DAILY_LIMIT</code>, 기본 30번) 안에서만 돼요. 체험 코드는
          학생에게 알려 주지 마세요.
        </Faq>
        <Faq q="예전 수업 사이트와 같이 써도 되나요?">
          네. 같은 데이터베이스를 쓰므로 예전 사이트의 제출도 여기서 보이고, 여기서 낸 제출도 예전 사이트 재생기로 볼 수 있어요.
        </Faq>
        <Faq q="사이트가 잠들지는 않나요?">
          접속이 없어도 바로 열리도록 만들었고, 하루 한 번 데이터베이스 연결을 확인해요. 처음 화면의 &ldquo;DB 연결&rdquo; 카드에서 마지막 확인 시각을 볼
          수 있어요. 파이썬은 처음 실행할 때만 몇 초 걸려요.
        </Faq>
        <Faq q="학생 한 명을 지우고 싶어요 (전학, 잘못 만든 계정)">
          🏫 학생 관리에서 그 학생의 &ldquo;삭제 요청&rdquo;을 누르고 이유를 적어 관리자에게 보내세요. 관리자가 그 학생의 백업을 받은 뒤 계정과 모든 기록을
          지워요. 필요하면 백업으로 되돌릴 수 있어요. 지우는 것은 관리자만 할 수 있어요.
        </Faq>
        <Faq q="정보는 언제까지 보관하나요?">
          학생 기록(계정, 제출·점수·피드백, AI 대화, 성찰, 메모, 연습 문제, 학생이 만든 문제)은 그 학년도가 끝나는 다음 해 2월 말까지 보관하고 모두
          지워요. 3월에 관리자 페이지의 &ldquo;학년도 말 정리&rdquo;에서 전체 백업(ZIP, 표마다 CSV)을 받고 이름 없는 통계를 남긴 뒤 지워요. 백업 ZIP으로
          되돌릴 수 있어요. 학생은 그 전에 💭 오늘의 성찰에서 &ldquo;내 성찰 모두 내려받기&rdquo;로 자기 성찰을 받아 둘 수 있어요.
        </Faq>
      </Section>

      <p className="text-center text-sm">
        <Link href="/" className="font-bold text-brand hover:underline">
          ← 처음 화면으로
        </Link>
      </p>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3 rounded-xl border border-line bg-white p-5 leading-7">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">💡 {children}</p>;
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="rounded-lg border border-line px-4 py-2">
      <summary className="cursor-pointer font-bold">{q}</summary>
      <p className="mt-1 text-sm leading-6 text-muted">{children}</p>
    </details>
  );
}

/** 수업 모형: 작성 → 재생 → 되돌아보기 → 성찰 */
function Flow() {
  const steps = [
    ["✍️", "작성", "기록 편집기에서 코드 쓰기, 과정 기반 AI 도우미"],
    ["▶", "재생", "내 작성 과정을 타임라인으로 다시 보기"],
    ["🤖", "되돌아보기", "AI가 과정의 순간을 짚어 질문"],
    ["💭", "성찰", "오늘의 성찰, 학습 여정, 연습 모드"],
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {steps.map(([icon, name, desc], i) => (
        <li key={name} className="rounded-lg bg-page px-3 py-2 text-sm">
          <p className="font-bold">
            {icon} {i + 1}. {name}
          </p>
          <p className="text-muted">{desc}</p>
        </li>
      ))}
    </ol>
  );
}
