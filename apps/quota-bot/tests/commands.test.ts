import test from "node:test";
import assert from "node:assert/strict";

import { handleCommand } from "../src/commands.js";
import { formatOverview } from "../src/format.js";

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

test("routes overview and push toggle commands", async () => {
  const context = {
    async getOverview() {
      return {
        activeCount: 2,
        fiveHourLeftPct: 91,
        weekLeftPct: 84,
        heaviestSessionLabel: "主会话（Telegram 私聊）",
        heaviestSessionContextPct: 58
      };
    },
    async listSessions() {
      return [];
    },
    async getSessionDetail(query: string) {
      return `查看 ${query}`;
    },
    async getRecentUsage() {
      return "最近消耗";
    },
    async getSubscriptionStatus() {
      return "订阅状态";
    },
    async enablePush() {
      return "已开启推送";
    },
    async disablePush() {
      return "已关闭推送";
    }
  };

  assert.match(await handleCommand("总览", context), /活跃会话：2/);
  assert.match(await handleCommand("总览", context), /最重会话：主会话（Telegram 私聊） · Context 58%/);
  assert.match(await handleCommand("纵览", context), /活跃会话：2/);
  assert.equal(await handleCommand("查询最近消耗", context), "最近消耗");
  assert.equal(await handleCommand("开启推送", context), "已开启推送");
  assert.equal(await handleCommand("关闭推送", context), "已关闭推送");
  assert.equal(await handleCommand("查看 abc", context), "查看 abc");
});
