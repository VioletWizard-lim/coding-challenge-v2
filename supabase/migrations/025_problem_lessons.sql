-- 025: 수업 문제에 성취기준·차시·기본/심화·앵커 (2027 작업 지시서 P4) — problems에 칸 5개 추가 (모두 비워 둘 수 있음, 기존 칸은 그대로)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (두 번 실행해도 괜찮음). 실행 전에 백업을 권한다.
--
-- 수업 계획: 8차시, 차시당 3~4문제(기본 → 심화), 차시의 마지막(가장 어려운) 문제가 기준 문제(앵커).
-- 성취기준 목록과 차시별 성취기준은 src/lib/standards.ts. 연구용 지표를 성취기준·차시·난이도 단계·앵커별로 나눠 내보낼 때 쓴다.
-- 이 SQL을 실행하기 전에도 문제 저장은 그대로 된다 (새 칸만 저장되지 않고 화면에 안내가 나옴).

alter table problems add column if not exists standards text[];      -- 성취기준 코드 여러 개 (예: {12정03-04,12정03-05})
alter table problems add column if not exists level text;            -- '기본' 또는 '심화'
alter table problems add column if not exists lesson integer;        -- 차시 (1, 2, …)
alter table problems add column if not exists lesson_order integer;  -- 차시 안 순서 (1, 2, 3, 4)
alter table problems add column if not exists anchor boolean;        -- 기준 문제(앵커): 차시의 마지막·가장 어려운 문제
