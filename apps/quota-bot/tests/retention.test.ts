import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createStore } from "../src/store.js";

test("prunes old snapshots beyond retention window", () => {
  const dir = mkdtempSync(join(tmpdir(), "quota-bot-retention-"));
  const store = createStore({ dbPath: join(dir, "quota-bot.sqlite") });

  store.upsertSession({
    sessionKey: "s1",
    label: "Session 1",
    kind: "main",
    owner: null,
    firstSeenAt: "2026-03-10T00:00:00.000Z",
    lastSeenAt: "2026-03-20T00:00:00.000Z",
    isActive: true
  });

  const oldSnapshotId = store.insertSnapshot({
    sessionKey: "s1",
    capturedAt: "2026-02-01T00:00:00.000Z",
    model: "m1",
    tokensIn: 10,
    tokensOut: 20,
    contextUsed: 30,
    contextMax: 100,
    fiveHourLeftPct: 80,
    weekLeftPct: 70,
    thinking: "off",
    rawStatusText: "old"
  });

  const newSnapshotId = store.insertSnapshot({
    sessionKey: "s1",
    capturedAt: "2026-03-20T00:00:00.000Z",
    model: "m1",
    tokensIn: 20,
    tokensOut: 30,
    contextUsed: 40,
    contextMax: 100,
    fiveHourLeftPct: 79,
    weekLeftPct: 69,
    thinking: "off",
    rawStatusText: "new"
  });

  store.insertUsageEvent({
    event: {
      sessionKey: "s1",
      eventType: "normal",
      deltaTokensIn: 10,
      deltaTokensOut: 10,
      deltaContext: 10
    },
    fromSnapshotId: oldSnapshotId,
    toSnapshotId: newSnapshotId,
    createdAt: "2026-03-20T00:00:00.000Z"
  });

  const pruned = store.pruneOldSnapshots("2026-03-01T00:00:00.000Z");
  assert.equal(pruned.snapshotsDeleted, 1);
  assert.equal(pruned.usageEventsDeleted, 1);
  const snapshotCount = (store.getDatabase().prepare("SELECT COUNT(*) as count FROM snapshots").get() as { count: number }).count;
  assert.equal(snapshotCount, 1);
  assert.equal(store.listRecentUsageEvents().length, 0);
});
