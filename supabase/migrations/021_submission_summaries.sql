-- 021: 제출마다 작성 기록 요약을 저장해 두는 표 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다. 실행 전에 백업을 권한다.
--
-- 학생 첫 화면·나의 학습 여정·업적은 제출의 작성 기록(edit_log)에서 숫자를 계산한다.
-- 기록은 제출마다 수십~수백 KB라서, 화면을 열 때마다 모든 제출의 기록을 읽으면 제출이 쌓일수록 느려진다.
-- 제출한 뒤에는 기록이 바뀌지 않으므로, 요약(통계·업적 판정 값)을 한 번 계산해 여기에 두고 다음부터는 이것만 읽는다.
--
-- - 이름·아이디·코드는 담지 않는다 (숫자와 시각뿐). 제출 번호로만 이어진다.
-- - 이 표가 없어도 사이트는 전과 같이 동작한다 (매번 기록에서 계산). 실행하면 그때부터 빨라진다.
-- - 지난 제출(v1 제출 포함)은 학생이 화면을 처음 열 때 한 번 계산해 채운다. 따로 옮길 것은 없다.
-- - 계산 방법이 바뀌면 version이 달라져 저절로 다시 계산한다. 이 표의 내용은 지워도 다시 만들어진다.

create table if not exists submission_summaries (
  submission_id bigint primary key,    -- submissions.id
  version integer not null,            -- 계산 방법의 판 번호 (src/lib/submissionSummary.ts의 SUMMARY_VERSION)
  data jsonb not null,                 -- 요약: 통계, 업적 판정 값
  created_at timestamptz not null default now()
);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table submission_summaries enable row level security;
