import test from "node:test";
import assert from "node:assert/strict";

import { createOpenClawAdapter } from "../src/openclaw-adapter.js";
import { __testOnly as telegramTestOnly } from "../src/telegram-bot.js";

test("telegram sender posts to Bot API when token and chat id are configured", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null
    });

    return {
      ok: true,
      async json() {
        return { ok: true };
      }
    } as Response;
  }) as typeof fetch;

  try {
    const adapter = await createOpenClawAdapter({
      telegram: {
        botToken: "token-123",
        chatId: "123456789",
        apiBaseUrl: "https://api.telegram.example"
      }
    });

    await adapter.sendMessage("hello quota bot");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.telegram.example/bottoken-123/sendMessage");
    assert.deepEqual(calls[0]?.body, {
      chat_id: "123456789",
      text: "hello quota bot",
      disable_web_page_preview: true
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("telegram sender splits oversized messages into multiple chunks", () => {
  const chunks = telegramTestOnly.splitTelegramMessage("a".repeat(9001), 4000);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0]?.length, 4000);
  assert.equal(chunks[1]?.length, 4000);
  assert.equal(chunks[2]?.length, 1001);
});
