import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatOverview } from "../src/format.js";
import { runCollectionCycle } from "../src/scheduler.js";
import { createStore } from "../src/store.js";
import type { DiscoveredSession } from "../src/types.js";

const sessions: DiscoveredSession[] = [
  {
    sessionKey: "agent:main:telegram:direct:1",
    label: "Main",
    kind: "main",
    updatedAt: "2026-03-20T10:00:00.000Z"
  }
];

const rawStatuses = [
  `🧠 Model: openai-codex/gpt-5.4\n🧮 Tokens: 100 in / 50 out\n📚 Context: 10k/200k (5%)\n📊 Usage: 5h 99% left ⏱4h 52m · Week 95% left ⏱4d 15h\n⚙️ Runtime: direct · Think: off · elevated`,
  `🧠 Model: openai-codex/gpt-5.4\n🧮 Tokens: 140 in / 80 out\n📚 Context: 14k/200k (7%)\n📊 Usage: 5h 98% left ⏱4h 40m · Week 94% left ⏱4d 10h\n⚙️ Runtime: direct · Think: off · elevated`
];

test("dry run discovers, collects, stores, diffs, and formats overview", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quota-bot-e2e-"));
  const store = createStore({ dbPath: join(dir, "quota-bot.sqlite") });
  let fetchCount = 0;
  const pushes: string[] = [];

  const deps = {
    sessionLister: {
      async list() {
        return sessions;
      }
    },
    statusFetcher: {
      async fetch() {
        return rawStatuses[Math.min(fetchCount++, rawStatuses.length - 1)] ?? rawStatuses[0]!;
      }
    },
    pushSink: {
      async sendMessage(text: string) {
        pushes.push(text);
      }
    },
    store,
    policy: {
      normalMergeWindowMs: 5 * 60_000,
      fiveHourThresholds: [30, 15, 5],
      weekThresholds: [40, 20, 10],
      contextThresholds: [70, 85, 95]
    },
    retentionDays: 30,
    pushState: { enabled: true }
  };

  const first = await runCollectionCycle(deps);
  const second = await runCollectionCycle(deps);

  assert.equal(first.snapshotsInserted, 1);
  assert.equal(first.eventsInserted, 0);
  assert.equal(second.snapshotsInserted, 1);
  assert.equal(second.eventsInserted, 1);
  assert.equal(pushes.length, 1);
  assert.match(pushes[0] ?? "", /合并推送：1 条事件/);

  const active = store.listActiveSessions();
  assert.equal(active.length, 1);

  const latest = store.getLatestSnapshot("agent:main:telegram:direct:1");
  assert.ok(latest);
  const overview = formatOverview({
    activeCount: active.length,
    fiveHourLeftPct: latest?.fiveHourLeftPct ?? null,
    weekLeftPct: latest?.weekLeftPct ?? null
  });

  assert.match(overview, /活跃会话：1/);
  assert.match(overview, /5h 剩余：98%/);
  assert.equal(store.listRecentUsageEvents().length, 1);
});
