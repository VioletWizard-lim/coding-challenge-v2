-- 007: 학생이 이미 본 업적 알림 기록 (users에 빈 칸 하나 추가, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 칸은 건드리지 않는다. v1은 이 칸을 쓰지 않는다.
--
-- 업적 자체는 제출·성찰 기록에서 매번 계산한다. 여기에는 "새 업적 알림을 이미 띄운 업적" 목록만 둔다.
-- 학교 컴퓨터가 재부팅 때 초기화되어도, 어느 컴퓨터에서든 알림이 한 번만 뜨게 하려는 것.
-- 예: ["first_line:0", "own_hands:0", "error_friend:0"]

alter table users add column if not exists achievements_seen jsonb;
