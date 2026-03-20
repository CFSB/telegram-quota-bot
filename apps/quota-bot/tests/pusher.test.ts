import test from "node:test";
import assert from "node:assert/strict";

import { buildPushBatches, flushPendingPushes } from "../src/pusher.js";
import type { PushPolicy } from "../src/config.js";
import type { UsageEventRecord } from "../src/types.js";

const policy: PushPolicy = {
  normalMergeWindowMs: 5 * 60_000,
  fiveHourThresholds: [30, 15, 5],
  weekThresholds: [40, 20, 10],
  contextThresholds: [70, 85, 95]
};

test("merges normal events inside throttle window", () => {
  const events: UsageEventRecord[] = [
    {
      id: 1,
      sessionKey: "s1",
      eventType: "normal",
      deltaTokensIn: 10,
      deltaTokensOut: 20,
      deltaContext: 30,
      fromSnapshotId: 1,
      toSnapshotId: 2,
      createdAt: "2026-03-20T09:00:00.000Z",
      pushedAt: null,
      pushStatus: null
    },
    {
      id: 2,
      sessionKey: "s2",
      eventType: "normal",
      deltaTokensIn: 5,
      deltaTokensOut: 8,
      deltaContext: 13,
      fromSnapshotId: 3,
      toSnapshotId: 4,
      createdAt: "2026-03-20T09:04:00.000Z",
      pushedAt: null,
      pushStatus: null
    }
  ];

  const batches = buildPushBatches(events, policy);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0]?.eventIds, [1, 2]);
  assert.match(batches[0]?.text ?? "", /合并推送：2 条事件/);
});

test("push flush ignores rollover and zero-delta events", async () => {
  const sent: string[] = [];
  const marked: Array<{ eventIds: number[]; pushStatus: string }> = [];
  const events: UsageEventRecord[] = [
    {
      id: 6,
      sessionKey: "agent:main:main",
      eventType: "reset_or_rollover",
      deltaTokensIn: null,
      deltaTokensOut: null,
      deltaContext: null,
      fromSnapshotId: 1,
      toSnapshotId: 2,
      createdAt: "2026-03-20T09:09:00.000Z",
      pushedAt: null,
      pushStatus: null
    },
    {
      id: 7,
      sessionKey: "agent:main:telegram:direct:1",
      eventType: "normal",
      deltaTokensIn: 0,
      deltaTokensOut: 0,
      deltaContext: 0,
      fromSnapshotId: 2,
      toSnapshotId: 3,
      createdAt: "2026-03-20T09:10:00.000Z",
      pushedAt: null,
      pushStatus: null
    }
  ];

  const batches = await flushPendingPushes(
    {
      listPendingUsageEvents() {
        return events;
      },
      markEventsPushed(eventIds, _pushedAt, pushStatus) {
        marked.push({ eventIds, pushStatus });
      }
    },
    {
      async sendMessage(text) {
        sent.push(text);
      }
    },
    policy
  );

  assert.equal(batches.length, 0);
  assert.equal(sent.length, 0);
  assert.deepEqual(marked, [{ eventIds: [6, 7], pushStatus: "ignored" }]);
});

test("push flush marks events as pushed safely", async () => {
  const sent: string[] = [];
  const marked: Array<{ eventIds: number[]; pushStatus: string }> = [];
  const events: UsageEventRecord[] = [
    {
      id: 7,
      sessionKey: "s1",
      eventType: "quota_warning",
      deltaTokensIn: null,
      deltaTokensOut: null,
      deltaContext: null,
      thresholdKind: "fiveHour",
      thresholdValue: 15,
      fromSnapshotId: 2,
      toSnapshotId: 3,
      createdAt: "2026-03-20T09:10:00.000Z",
      pushedAt: null,
      pushStatus: null
    }
  ];

  const batches = await flushPendingPushes(
    {
      listPendingUsageEvents() {
        return events;
      },
      markEventsPushed(eventIds, _pushedAt, pushStatus) {
        marked.push({ eventIds, pushStatus });
      }
    },
    {
      async sendMessage(text) {
        sent.push(text);
      }
    },
    policy
  );

  assert.equal(batches.length, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0] ?? "", /额度告警/);
  assert.deepEqual(marked, [{ eventIds: [7], pushStatus: "immediate_alert" }]);
});
