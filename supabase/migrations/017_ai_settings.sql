-- 017: 과목별 AI 기능 설정 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다. 실행 전에 백업을 권한다.
--
-- 교사가 과목마다 AI 도우미·AI 되돌아보기를 켜고 끄고, 수행평가 같은 단원은 AI 도우미를 끈다.
-- 선생님 지침(note)은 AI 도우미·되돌아보기에 함께 보낸다(안전 지침보다 앞서지 않음).
-- 저장된 것이 없으면 모두 켜짐(지금과 같음).

create table if not exists ai_settings (
  subject text primary key,
  helper_enabled boolean not null default true,   -- AI 도우미 (수업 문제·연습 문제·학생이 만든 문제)
  review_enabled boolean not null default true,   -- AI 되돌아보기 (제출 뒤)
  helper_off_units jsonb not null default '[]',   -- AI 도우미를 끈 단원 (예: ["3", "5"] = 3단원·5단원 수업 문제)
  note text not null default '',                  -- 선생님 지침 (AI에 함께 보냄)
  updated_at timestamptz not null default now()
);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table ai_settings enable row level security;
