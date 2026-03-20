import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";

test("loadConfig reads telegram settings from environment", () => {
  const original = {
    QUOTA_BOT_TELEGRAM_BOT_TOKEN: process.env.QUOTA_BOT_TELEGRAM_BOT_TOKEN,
    QUOTA_BOT_TELEGRAM_CHAT_ID: process.env.QUOTA_BOT_TELEGRAM_CHAT_ID,
    QUOTA_BOT_TELEGRAM_API_BASE: process.env.QUOTA_BOT_TELEGRAM_API_BASE
  };

  process.env.QUOTA_BOT_TELEGRAM_BOT_TOKEN = "token-123";
  process.env.QUOTA_BOT_TELEGRAM_CHAT_ID = "chat-456";
  process.env.QUOTA_BOT_TELEGRAM_API_BASE = "https://telegram.example.test";

  try {
    const config = loadConfig();
    assert.equal(config.telegram.botToken, "token-123");
    assert.equal(config.telegram.chatId, "chat-456");
    assert.equal(config.telegram.apiBaseUrl, "https://telegram.example.test");
  } finally {
    restoreEnv(original);
  }
});

function restoreEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}
