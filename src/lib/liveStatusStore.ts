import "server-only";
import { classOf } from "./classes";
import { db } from "./db";
import type { LivePayload, LiveRow } from "./liveStatus";
import { gradeClassFor } from "./problems";
import { STUCK_RULES } from "./stuckRules";

/** live_status 표가 없어서(024 실행 전) 생긴 오류인지 */
const tableMissing = (message: string) => /live_status/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** 학생 한 명·문제 하나의 상태를 덮어쓴다. 표가 없으면 조용히 넘어간다 (수업에 지장 없게) */
export async function upsertLive(userId: string, subject: string, problem: string, p: LivePayload): Promise<void> {
  const { error } = await db()
    .from("live_status")
    .upsert(
      {
        user_id: userId,
        subject,
        problem,
        opened_at: iso(p.openedAt),
        first_input_at: iso(p.firstInputAt),
        last_active_at: iso(p.lastActiveAt),
        nudge_count: p.nudgeCount,
        last_nudge_rule: p.lastNudgeRule,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,subject,problem" },
    );
  if (error && !tableMissing(error.message)) console.warn("작성 중 상태 저장 실패:", error.message);
  // 가끔 이틀 지난 줄을 지운다 (그날 수업용 표라 쌓이지 않게)
  if (Math.random() < 0.02) {
    await db()
      .from("live_status")
      .delete()
      .lt("updated_at", new Date(Date.now() - STUCK_RULES.live.keepMs).toISOString());
  }
}

type Row = {
  user_id: string;
  subject: string;
  problem: string;
  opened_at: string;
  first_input_at: string | null;
  last_active_at: string | null;
  nudge_count: number;
  last_nudge_rule: string | null;
  updated_at: string;
};

const ms = (v: string | null) => (v ? new Date(v).getTime() : null);

/**
 * 교사 화면용: 지금 화면에 있는 학생들의 상태 (presentMs 안에 보낸 것) + 이름·반.
 * 조회는 여기 한 곳에서 한다 (다른 학교로 넓힐 때 학교 조건(users.school)을 이곳에 넣는다, CLAUDE.md).
 */
export async function listLiveNow(): Promise<{ ready: boolean; rows: LiveRow[] }> {
  const since = new Date(Date.now() - STUCK_RULES.live.presentMs).toISOString();
  const { data, error } = await db().from("live_status").select("*").gte("updated_at", since).order("opened_at").limit(1000);
  if (error && tableMissing(error.message)) return { ready: false, rows: [] };
  if (error) throw new Error(`작성 중 상태 조회 실패: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const users = new Map<string, { name: string; grade: unknown; class: unknown; programming_grade: unknown; programming_class: unknown }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: us, error: ue } = await db()
      .from("users")
      .select("id, name, grade, class, programming_grade, programming_class")
      .in("id", ids.slice(i, i + 200));
    if (ue) throw new Error(`학생 조회 실패: ${ue.message}`);
    for (const u of us ?? []) users.set(String(u.id), u);
  }
  return {
    ready: true,
    rows: rows.flatMap((r): LiveRow[] => {
      const u = users.get(r.user_id);
      if (!u) return []; // 지워진 계정
      const gc = gradeClassFor(u as Parameters<typeof gradeClassFor>[0], r.subject);
      return [
        {
          userId: r.user_id,
          name: u.name,
          cls: classOf(gc.grade, gc.class),
          subject: r.subject,
          problem: r.problem,
          openedAt: ms(r.opened_at)!,
          firstInputAt: ms(r.first_input_at),
          lastActiveAt: ms(r.last_active_at),
          nudgeCount: Number(r.nudge_count) || 0,
          lastNudgeRule: r.last_nudge_rule,
          updatedAt: ms(r.updated_at)!,
        },
      ];
    }),
  };
}
