import assert from "node:assert/strict";
import test from "node:test";
import { selectStaleRecords, type GameRecord } from "../src/stale_record_policy.js";

test("selects expired records by category and preserves legal holds", () => {
  const records: GameRecord[] = [
    { id: "asset-old", kind: "player_asset", objectKey: "players/7/old.png", lastActiveAt: "2026-01-01T00:00:00.000Z", legalHold: false },
    { id: "event-fresh", kind: "live_event", objectKey: "events/9/replay.json", lastActiveAt: "2026-02-26T00:00:00.000Z", legalHold: false },
    { id: "moderation-held", kind: "moderation_queue", objectKey: "moderation/4/evidence.json", lastActiveAt: "2025-01-01T00:00:00.000Z", legalHold: true }
  ];

  const stale = selectStaleRecords(records, new Date("2026-03-01T00:00:00.000Z"));

  assert.deepEqual(stale.map((record) => record.id), ["asset-old"]);
});
