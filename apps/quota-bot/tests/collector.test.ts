import test from "node:test";
import assert from "node:assert/strict";

import { collectOne, parseStatus } from "../src/collector.js";

test("parser extracts model, tokens, context, thinking, and week quota", async () => {
  const raw = `🧠 Model: openai-codex/gpt-5.4\n🧮 Tokens: 859 in / 917 out\n📚 Context: 20k/272k (7%)\n📊 Usage: 5h 99% left ⏱4h 52m · Week 93% left ⏱4d 15h\n⚙️ Runtime: direct · Think: off · elevated`;

  const parsed = parseStatus(raw);

  assert.equal(parsed.model, "openai-codex/gpt-5.4");
  assert.equal(parsed.tokensIn, 859);
  assert.equal(parsed.tokensOut, 917);
  assert.equal(parsed.contextUsed, 20000);
  assert.equal(parsed.contextMax, 272000);
  assert.equal(parsed.thinking, "off");
  assert.equal(parsed.weekLeftPct, 93);

  const snapshot = await collectOne(
    {
      async fetch() {
        return raw;
      }
    },
    "agent:main:telegram:direct:1"
  );

  assert.equal(snapshot.sessionKey, "agent:main:telegram:direct:1");
  assert.equal(snapshot.model, "openai-codex/gpt-5.4");
  assert.equal(typeof snapshot.capturedAt, "string");
});
