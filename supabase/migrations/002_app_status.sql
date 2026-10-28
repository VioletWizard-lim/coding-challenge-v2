-- 002: 사이트 상태 기록 테이블 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만)
--
-- /api/health 가 하루 한 번(Vercel Cron) DB를 확인하고 마지막 확인 시각을 여기에 남긴다.
-- 교사 화면에서 "마지막 상태 확인 시각"으로 보여 줄 예정이다.
-- 이 테이블이 없어도 /api/health 는 동작한다(기록만 건너뜀).

create table if not exists app_status (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
