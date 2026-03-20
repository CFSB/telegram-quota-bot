import test from "node:test";
import assert from "node:assert/strict";

import { detectQuotaWarnings, diffSnapshots } from "../src/diff.js";

test("computes positive token delta", () => {
  const before = {
    sessionKey: "s1",
    capturedAt: "2026-03-20T00:00:00.000Z",
    model: null,
    tokensIn: 100,
    tokensOut: 20,
    contextUsed: 1000,
    contextMax: 4000
  };
  const after = {
    ...before,
    capturedAt: "2026-03-20T00:05:00.000Z",
    tokensIn: 140,
    tokensOut: 55,
    contextUsed: 1300
  };

  assert.deepEqual(diffSnapshots(before, after), {
    sessionKey: "s1",
    eventType: "normal",
    deltaTokensIn: 40,
    deltaTokensOut: 35,
    deltaContext: 300
  });
});

test("emits warning events for quota and context threshold crossings", () => {
  const before = {
    sessionKey: "s1",
    capturedAt: "2026-03-20T00:00:00.000Z",
    model: null,
    tokensIn: 100,
    tokensOut: 20,
    contextUsed: 2000,
    contextMax: 10000,
    fiveHourLeftPct: 35,
    weekLeftPct: 50
  };
  const after = {
    ...before,
    capturedAt: "2026-03-20T00:05:00.000Z",
    fiveHourLeftPct: 15,
    weekLeftPct: 20,
    contextUsed: 8600
  };

  const events = detectQuotaWarnings(before, after);

  assert.deepEqual(events, [
    {
      sessionKey: "s1",
      eventType: "quota_warning",
      deltaTokensIn: null,
      deltaTokensOut: null,
      deltaContext: null,
      thresholdKind: "fiveHour",
      thresholdValue: 30
    },
    {
      sessionKey: "s1",
      eventType: "quota_warning",
      deltaTokensIn: null,
      deltaTokensOut: null,
      deltaContext: null,
      thresholdKind: "fiveHour",
      thresholdValue: 15
    },
    {
      sessionKey: "s1",
      eventType: "quota_warning",
      deltaTokensIn: null,
      deltaTokensOut: null,
      deltaContext: null,
      thresholdKind: "week",
      thresholdValue: 40
    },
    {
      sessionKey: "s1",
      eventType: "quota_warning",
      deltaTokensIn: null,
      deltaTokensOut: null,
      deltaContext: null,
      thresholdKind: "week",
      thresholdValue: 20
    },
    {
      sessionKey: "s1",
      eventType: "context_warning",
      deltaTokensIn: null,
      deltaTokensOut: null,
      deltaContext: null,
      thresholdKind: "context",
      thresholdValue: 70
    },
    {
      sessionKey: "s1",
      eventType: "context_warning",
      deltaTokensIn: null,
      deltaTokensOut: null,
      deltaContext: null,
      thresholdKind: "context",
      thresholdValue: 85
    }
  ]);
});
