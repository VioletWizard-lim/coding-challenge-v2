-- 004: 문제 양식 칸 추가 (003 다음에 실행, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 003_problems.sql로 만든 problems 표에 칸만 더한다. 기존 칸·데이터는 그대로.
--
-- 문제 양식: 난이도(별 1~5), 문제(description 칸), 조건, 예시(입력·출력 쌍), 문제 목표, 도전 과제(선택)

alter table problems add column if not exists difficulty smallint check (difficulty between 1 and 5);
alter table problems add column if not exists conditions text not null default '';
alter table problems add column if not exists examples jsonb not null default '[]'::jsonb;
alter table problems add column if not exists goal text not null default '';
alter table problems add column if not exists challenge text not null default '';
