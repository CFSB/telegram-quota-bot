import test from "node:test";
import assert from "node:assert/strict";

import { __testOnly } from "../src/openclaw-adapter.js";

test("buildSyntheticStatus emits parser-friendly status text", () => {
  const raw = __testOnly.buildSyntheticStatus(
    {
      key: "agent:main:telegram:direct:123456789",
      inputTokens: 859,
      outputTokens: 917,
      totalTokens: 20000,
      contextTokens: 272000,
      model: "gpt-5.4",
      modelProvider: "openai-codex",
      thinkingLevel: "high"
    },
    {
      providers: [
        {
          provider: "openai-codex",
          windows: [
            { label: "5h", usedPercent: 1, resetAt: Date.now() + 4 * 3600_000 },
            { label: "Week", usedPercent: 7, resetAt: Date.now() + 4 * 86400_000 }
          ]
        }
      ]
    }
  );

  assert.match(raw, /🧠 Model: openai-codex\/gpt-5.4/);
  assert.match(raw, /🧮 Tokens: 859 in \/ 917 out/);
  assert.match(raw, /📚 Context: 20k \/ 272k \(7%\)/);
  assert.match(raw, /📊 Usage: 5h 99% left/);
  assert.match(raw, /Week 93% left/);
  assert.match(raw, /Think: high/);
});

test("formatRemaining prefers compact day/hour/minute output", () => {
  assert.equal(__testOnly.formatRemaining(4 * 86400_000 + 15 * 3600_000), "4d 15h");
  assert.equal(__testOnly.formatRemaining(4 * 3600_000 + 52 * 60_000), "4h 52m");
});
