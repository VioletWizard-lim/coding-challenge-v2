-- 023: AI 도우미 "기록으로 되묻기" (2027 작업 지시서 P1) — ai_chats에 칸 4개 추가 (모두 비워 둘 수 있음, 기존 칸은 그대로)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (두 번 실행해도 괜찮음). 실행 전에 백업을 권한다.
-- (2026-11-27에 이미 실행함. 이 파일은 기록용)
--
-- 학생이 AI 도우미에게 물으면, 사이트가 작성 기록에서 막힌 순간을 찾아 먼저 되묻고(step='ask', AI 호출 없음),
-- 학생이 답하면 AI가 그 답과 과정 기록을 근거로 힌트를 준다(step='hint').
-- 되물음에 보여 준 기록 구간·학생 답·AI 힌트를 이어서 저장해 연구 지표 6(막힌 지점을 스스로 짚었는지)의 원자료로 쓴다.
-- 예전 대화는 새 칸이 비어 있는 채로 그대로 보인다.

alter table ai_chats add column if not exists step text;        -- 'ask': 사이트가 기록을 보여 주며 되물음 / 'hint': 학생 답을 보고 AI가 준 힌트
alter table ai_chats add column if not exists situation text;   -- 'A' 이번 문제 기록 / 'B' 코드 거의 없음 / 'C' 이전 문제 기록
alter table ai_chats add column if not exists clip jsonb;        -- 되물음에 보여 준 기록 구간 (src/lib/askBack.ts의 AskClip)
alter table ai_chats add column if not exists parent_id bigint;  -- 이 힌트가 어느 되물음(ai_chats.id)에 대한 답인지
