import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { SessionId } from "@zcode/contracts";
import { readSessionTarget, setSessionTarget, updateSessionTargetStatus } from "../src/storage/session-target.js";

test("completion compare-and-set cannot complete a replaced, paused, edited or cleared goal", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`create table session (id text primary key, time_updated integer);
    insert into session values ('test', 0);
    create table session_target (
      session_id text primary key, target_id text, objective text, summary_title text,
      status text, token_budget integer, tokens_used integer, time_used_seconds integer,
      active_input_id text, active_run_started_at integer, active_run_last_seen_at integer,
      time_created integer, time_updated integer
    );`);
  const sessionID = "test" as SessionId;
  try {
    for (const mutation of ["replace", "pause", "budget", "edit", "clear", "none"]) {
      const target = setSessionTarget(db, { sessionID, objective: "Goal A", status: "active" });
      if (mutation === "replace") setSessionTarget(db, { sessionID, objective: "Goal B", status: "active" });
      if (mutation === "budget") updateSessionTargetStatus(db, { sessionID, status: "budget_limited" });
      if (mutation === "pause") updateSessionTargetStatus(db, { sessionID, status: "paused" });
      if (mutation === "edit") db.prepare("update session_target set objective = ? where session_id = ?").run("Edited", sessionID);
      if (mutation === "clear") db.prepare("delete from session_target where session_id = ?").run(sessionID);
      const before = readSessionTarget(db, { sessionID });
      const result = updateSessionTargetStatus(db, { sessionID, status: "complete", expected: target });
      if (mutation === "none") {
        assert.equal(result?.status, "complete");
        assert.equal(result?.targetID, target.targetID);
      } else {
        assert.equal(result, null, mutation);
        assert.deepEqual(readSessionTarget(db, { sessionID }), before, mutation);
      }
    }
  } finally { db.close(); }
});
