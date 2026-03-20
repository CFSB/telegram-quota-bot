import test from "node:test";
import assert from "node:assert/strict";

import { __testOnly } from "../src/telegram-bot.js";

test("start message includes current status summary", () => {
  const text = __testOnly.buildStartMessage(
    { activeCount: 4, fiveHourLeftPct: 58, weekLeftPct: 80 },
    "推送：已开启\n普通事件合并窗口：5 分钟"
  );
  assert.match(text, /当前活跃会话：4/);
  assert.match(text, /5h 剩余：58%/);
  assert.match(text, /Week 剩余：80%/);
  assert.match(text, /推送：已开启/);
});

test("help message mentions button-first usage and commands", () => {
  const text = __testOnly.buildHelpMessage();
  assert.match(text, /直接点底部按钮/);
  assert.match(text, /总览/);
  assert.match(text, /\/overview/);
});

test("normalizes slash commands into bot text commands", () => {
  assert.equal(__testOnly.normalizeTelegramInput("/overview"), "总览");
  assert.equal(__testOnly.normalizeTelegramInput("/sessions"), "会话列表");
  assert.equal(__testOnly.normalizeTelegramInput("/usage"), "最近消耗");
  assert.equal(__testOnly.normalizeTelegramInput("/subscription"), "订阅状态");
  assert.equal(__testOnly.normalizeTelegramInput("/push_on"), "开启推送");
  assert.equal(__testOnly.normalizeTelegramInput("/push_off"), "关闭推送");
  assert.equal(__testOnly.normalizeTelegramInput("/view 2"), "查看 2");
});

test("keyboard exposes the most important commands", () => {
  assert.deepEqual(__testOnly.COMMAND_KEYBOARD.keyboard, [
    ["总览", "会话列表"],
    ["最近消耗", "订阅状态"],
    ["开启推送", "关闭推送"],
    ["/help"]
  ]);
  assert.equal(__testOnly.BOT_COMMANDS.length >= 6, true);
});
