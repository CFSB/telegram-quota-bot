import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCommandContext } from "../src/query-context.js";
import { createStore } from "../src/store.js";

test("command context renders session and usage views and toggles push", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quota-bot-query-"));
  const store = createStore({ dbPath: join(dir, "quota-bot.sqlite") });

  store.upsertSession({
    sessionKey: "agent:main:telegram:direct:1",
    label: "Main",
    kind: "main",
    owner: null,
    firstSeenAt: "2026-03-20T10:00:00.000Z",
    lastSeenAt: "2026-03-20T10:00:00.000Z",
    isActive: true
  });

  const snapshotId = store.insertSnapshot({
    sessionKey: "agent:main:telegram:direct:1",
    capturedAt: "2026-03-20T10:00:01.000Z",
    model: "openai-codex/gpt-5.4",
    tokensIn: 100,
    tokensOut: 50,
    contextUsed: 12000,
    contextMax: 272000,
    fiveHourLeftPct: 98,
    weekLeftPct: 92
  });

  store.insertUsageEvent({
    event: {
      sessionKey: "agent:main:telegram:direct:1",
      eventType: "normal",
      deltaTokensIn: 40,
      deltaTokensOut: 20,
      deltaContext: 3000
    },
    fromSnapshotId: null,
    toSnapshotId: snapshotId,
    createdAt: "2026-03-20T10:00:02.000Z"
  });

  const deps = {
    sessionLister: { async list() { return []; } },
    statusFetcher: { async fetch() { return ""; } },
    pushSink: { async sendMessage() {} },
    store,
    policy: {
      normalMergeWindowMs: 300000,
      fiveHourThresholds: [30, 15, 5],
      weekThresholds: [20, 10],
      contextThresholds: [70, 85, 95]
    },
    retentionDays: 30,
    pushState: { enabled: true }
  };

  const context = createCommandContext(deps, {
    dbPath: join(dir, "quota-bot.sqlite"),
    pollIntervalMs: 60000,
    retentionDays: 30,
    pushEnabled: true,
    pushPolicy: deps.policy,
    telegram: {
      botToken: null,
      chatId: null,
      apiBaseUrl: "https://api.telegram.org"
    }
  });

  assert.match((await context.getOverview()).fiveHourLeftPct?.toString() ?? "", /98/);
  assert.match(await context.getSessionDetail("1"), /模型：openai-codex\/gpt-5.4/);
  assert.match(await context.getRecentUsage(), /最近采集：/);
  assert.match(await context.getRecentUsage(), /\+40 in/);
  assert.equal(await context.disablePush(), "已关闭推送");
  assert.equal(deps.pushState.enabled, false);
  assert.equal(await context.enablePush(), "已开启推送");
  assert.equal(deps.pushState.enabled, true);
});

test("recent usage shows last snapshot time when there are no events", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quota-bot-query-empty-"));
  const store = createStore({ dbPath: join(dir, "quota-bot.sqlite") });

  store.upsertSession({
    sessionKey: "agent:main:web:1",
    label: "Web",
    kind: "main",
    owner: null,
    firstSeenAt: "2026-03-20T10:00:00.000Z",
    lastSeenAt: "2026-03-20T10:00:00.000Z",
    isActive: true
  });

  store.insertSnapshot({
    sessionKey: "agent:main:web:1",
    capturedAt: "2026-03-20T10:05:00.000Z",
    model: "openai-codex/gpt-5.4",
    tokensIn: 10,
    tokensOut: 5,
    contextUsed: 1000,
    contextMax: 272000,
    fiveHourLeftPct: 99,
    weekLeftPct: 95
  });

  const deps = {
    sessionLister: { async list() { return []; } },
    statusFetcher: { async fetch() { return ""; } },
    pushSink: { async sendMessage() {} },
    store,
    policy: {
      normalMergeWindowMs: 300000,
      fiveHourThresholds: [30, 15, 5],
      weekThresholds: [20, 10],
      contextThresholds: [70, 85, 95]
    },
    retentionDays: 30,
    pushState: { enabled: true }
  };

  const context = createCommandContext(deps, {
    dbPath: join(dir, "quota-bot.sqlite"),
    pollIntervalMs: 60000,
    retentionDays: 30,
    pushEnabled: true,
    pushPolicy: deps.policy,
    telegram: {
      botToken: null,
      chatId: null,
      apiBaseUrl: "https://api.telegram.org"
    }
  });

  const text = await context.getRecentUsage();
  assert.match(text, /最近没有新的消耗记录/);
  assert.match(text, /最近采集：/);

  const overview = await context.getOverview();
  assert.equal(overview.heaviestSessionLabel, "Web");
  assert.equal(overview.heaviestSessionContextPct, 1);
});
