// worker 侧持久时间线:任务事件先写库(事务内取 max(seq)+1)再广播到 tl:<projectId>。
// 与 api 的 projects.mjs appendEvent 同构,worker 完成任务不依赖任何在线前端。
export async function appendTimeline(pool, pub, projectId, kind, payload) {
  if (!projectId) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      `insert into timeline_events (project_id, seq, kind, payload)
       select $1, coalesce(max(seq), 0) + 1, $2, $3::jsonb
         from timeline_events where project_id = $1
       returning seq, kind, payload, created_at`,
      [projectId, kind, JSON.stringify(payload ?? {})]
    );
    await client.query("commit");
    const ev = rows[0];
    await pub
      .publish(`tl:${projectId}`, JSON.stringify({
        seq: Number(ev.seq), kind: ev.kind,
        payload: ev.payload, created_at: ev.created_at,
      }))
      .catch(() => {});
    return ev;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return null; // 时间线失败不应影响任务主流程
  } finally {
    client.release();
  }
}
