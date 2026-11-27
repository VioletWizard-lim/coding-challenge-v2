-- 024: 작성 중 상태 (2027 작업 지시서 P3: 교사 화면의 "시작 지연·막힘 반복" 학생 표시) — 새 표 하나, 기존 표는 그대로
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (두 번 실행해도 괜찮음). 실행 전에 백업을 권한다.
--
-- 학생이 문제를 쓰는 동안 짧은 상태만 담는다: 학생 한 명이 문제 하나마다 한 줄 (계속 쌓이지 않고 같은 줄을 덮어씀).
-- 문제를 열 때·첫 입력 때·막힘 알림이 뜰 때 바로, 그 사이에는 그 화면을 보고 있을 때만 2분마다 보낸다.
-- 코드 내용과 작성 기록은 담지 않는다 (시각·숫자·막힘 종류만). 그날 수업용이라 이틀 지난 줄은 사이트가 지운다.
-- 학생 삭제·학년도 말 정리 때 함께 지워진다 (src/lib/yearEnd.ts YEAR_TABLES).
-- 이 표가 없어도 사이트는 전과 같이 동작한다 (교사 화면 카드만 "SQL을 실행해 주세요"라고 보임).

create table if not exists live_status (
  user_id text not null,              -- 학생 users.id
  subject text not null,
  problem text not null,              -- 문제 ("2-3", 연습 문제 "P12", 학생이 만든 문제 "S7")
  opened_at timestamptz not null,     -- 이번에 문제를 연 시각
  first_input_at timestamptz,         -- 연 뒤 처음 입력한 시각 (비어 있으면 아직 시작 안 함)
  last_active_at timestamptz,         -- 마지막으로 쓰거나 실행한 시각
  nudge_count integer not null default 0,  -- 이번에 연 뒤 뜬 막힘 알림 수
  last_nudge_rule text,               -- 마지막 막힘 종류 (error-repeat, paste-error, same-line, long-pause)
  updated_at timestamptz not null default now(),  -- 마지막으로 상태를 보낸 시각
  primary key (user_id, subject, problem)
);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table live_status enable row level security;
