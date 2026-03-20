import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { loadConfig } from "./config.js";
import { createOpenClawAdapter } from "./openclaw-adapter.js";
import { createCommandContext } from "./query-context.js";
import { runCollectionCycle, startScheduler } from "./scheduler.js";
import { createStore } from "./store.js";
import { startTelegramCommandBot } from "./telegram-bot.js";

export async function main(): Promise<void> {
  const config = loadConfig();
  mkdirSync(dirname(config.dbPath), { recursive: true });

  const store = createStore({ dbPath: config.dbPath });
  const adapter = await createOpenClawAdapter({ telegram: config.telegram });
  const pushState = { enabled: config.pushEnabled };

  const deps = {
    sessionLister: { list: () => adapter.listSessions() },
    statusFetcher: { fetch: (sessionKey: string) => adapter.fetchStatus(sessionKey) },
    pushSink: { sendMessage: (text: string) => adapter.sendMessage(text) },
    store,
    policy: config.pushPolicy,
    retentionDays: config.retentionDays,
    pushState
  };

  const startup = await runCollectionCycle(deps);
  console.log("quota-bot startup cycle ok", startup);

  if (process.env.QUOTA_BOT_RUN_ONCE === "1") {
    return;
  }

  const timer = startScheduler(deps, config.pollIntervalMs);
  const commandContext = createCommandContext(deps, config);
  const telegramRuntime = startTelegramCommandBot(config.telegram, deps, commandContext);
  console.log("quota-bot scheduler started", {
    pollIntervalMs: config.pollIntervalMs,
    telegramCommands: Boolean(telegramRuntime)
  });

  const shutdown = () => {
    clearInterval(timer);
    telegramRuntime?.stop();
    console.log("quota-bot scheduler stopped");
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

void main().catch((error: unknown) => {
  console.error("quota-bot fatal error", error);
  process.exit(1);
});
