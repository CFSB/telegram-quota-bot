import test from "node:test";
import assert from "node:assert/strict";

import { formatOverview, formatSessionList } from "../src/format.js";

test("formats overview summary", () => {
  const text = formatOverview({
    activeCount: 2,
    fiveHourLeftPct: 91,
    weekLeftPct: 84,
    heaviestSessionLabel: "主会话（Telegram 私聊）",
    heaviestSessionContextPct: 58
  });
  assert.match(text, /活跃会话：2/);
  assert.match(text, /5h 剩余：91%/);
  assert.match(text, /最重会话：主会话（Telegram 私聊） · Context 58%/);
});

test("groups session list by kind", () => {
  const text = formatSessionList([
    {
      label: "主会话（Telegram 私聊）",
      kind: "main",
      model: "openai-codex/gpt-5.4",
      contextUsed: 1000,
      contextMax: 272000,
      updatedAt: "2026-03-20T10:00:00.000Z"
    },
    {
      label: "quota-bot-finish（子代理）",
      kind: "subagent",
      model: "openai-codex/gpt-5.4",
      contextUsed: 500,
      contextMax: 272000,
      updatedAt: "2026-03-20T10:01:00.000Z"
    }
  ]);

  assert.match(text, /【主会话】/);
  assert.match(text, /【子代理】/);
  assert.match(text, /主会话（Telegram 私聊）/);
  assert.match(text, /quota-bot-finish（子代理）/);
});
