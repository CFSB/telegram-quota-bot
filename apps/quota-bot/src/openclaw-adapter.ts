import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import type { TelegramConfig } from "./config.js";
import { normalizeDiscoveredSession } from "./session-discovery.js";
import { sendTelegramMessage } from "./telegram-bot.js";
import type { DiscoveredSession } from "./types.js";

const execFileAsync = promisify(execFile);

export interface OpenClawAdapter {
  listSessions(): Promise<DiscoveredSession[]>;
  fetchStatus(sessionKey: string): Promise<string>;
  sendMessage(text: string): Promise<void>;
}

export interface OpenClawAdapterOptions {
  telegram: TelegramConfig;
}

interface FixturePayload {
  sessions: DiscoveredSession[];
  statuses: Record<string, string>;
}

interface GatewaySessionsListResult {
  sessions: GatewaySessionRow[];
}

interface GatewaySessionRow {
  key: string;
  label?: string | null;
  displayName?: string | null;
  updatedAt?: number;
  kind?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  contextTokens?: number | null;
  model?: string | null;
  modelProvider?: string | null;
  thinkingLevel?: string | null;
}

interface UsageStatusResult {
  providers?: Array<{
    provider?: string;
    windows?: Array<{
      label?: string;
      usedPercent?: number;
      resetAt?: number;
    }>;
  }>;
}

interface CliStateSnapshot {
  sessions: GatewaySessionRow[];
  usage: UsageStatusResult | null;
  fetchedAtMs: number;
}

export async function createOpenClawAdapter(options: OpenClawAdapterOptions): Promise<OpenClawAdapter> {
  const sendMessage = createPushSender(options.telegram);
  const fixturePath = process.env.QUOTA_BOT_FIXTURE_PATH;

  if (fixturePath) {
    const payload = JSON.parse(await readFile(fixturePath, "utf8")) as FixturePayload;
    return {
      async listSessions() {
        return payload.sessions;
      },
      async fetchStatus(sessionKey: string) {
        const status = payload.statuses[sessionKey];
        if (!status) {
          throw new Error(`missing fixture status for session ${sessionKey}`);
        }
        return status;
      },
      sendMessage
    };
  }

  return createCliAdapter(sendMessage);
}

export function createNoopAdapter(sendMessage: OpenClawAdapter["sendMessage"] = defaultNoopSend): OpenClawAdapter {
  return {
    async listSessions() {
      return [];
    },
    async fetchStatus(sessionKey: string) {
      throw new Error(`no OpenClaw adapter configured for ${sessionKey}`);
    },
    sendMessage
  };
}

function createCliAdapter(sendMessage: OpenClawAdapter["sendMessage"]): OpenClawAdapter {
  let state: CliStateSnapshot | null = null;

  async function loadState(force = false): Promise<CliStateSnapshot> {
    if (!force && state && Date.now() - state.fetchedAtMs < 10_000) {
      return state;
    }

    const [sessionsResult, usageResult] = await Promise.all([
      runJson<GatewaySessionsListResult>("openclaw", [
        "gateway",
        "call",
        "sessions.list",
        "--json",
        "--params",
        '{"limit":200}'
      ]),
      runJson<UsageStatusResult>("openclaw", ["gateway", "call", "usage.status", "--json"]).catch(() => null)
    ]);

    state = {
      sessions: sessionsResult.sessions ?? [],
      usage: usageResult,
      fetchedAtMs: Date.now()
    };

    return state;
  }

  return {
    async listSessions() {
      const current = await loadState(true);
      return current.sessions.map((row) =>
        normalizeDiscoveredSession({
          sessionKey: row.key,
          label: row.label ?? row.displayName ?? row.key,
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null
        })
      );
    },
    async fetchStatus(sessionKey: string) {
      const current = await loadState();
      const row = current.sessions.find((entry) => entry.key === sessionKey);
      if (!row) {
        const refreshed = await loadState(true);
        const next = refreshed.sessions.find((entry) => entry.key === sessionKey);
        if (!next) {
          throw new Error(`session not found in OpenClaw gateway: ${sessionKey}`);
        }
        return buildSyntheticStatus(next, refreshed.usage);
      }

      return buildSyntheticStatus(row, current.usage);
    },
    sendMessage
  };
}

function createPushSender(telegram: TelegramConfig): OpenClawAdapter["sendMessage"] {
  if (!telegram.botToken || !telegram.chatId) {
    return defaultNoopSend;
  }

  return async (text: string) => {
    await sendTelegramMessage(telegram, telegram.chatId!, text);
  };
}

async function defaultNoopSend(text: string): Promise<void> {
  console.log(`[quota-bot noop send]\n${text}`);
}

async function runJson<T>(command: string, args: string[]): Promise<T> {
  const { stdout } = await execFileAsync(command, args, {
    maxBuffer: 5 * 1024 * 1024
  });
  return JSON.parse(stdout) as T;
}

function buildSyntheticStatus(row: GatewaySessionRow, usage: UsageStatusResult | null): string {
  const provider = row.modelProvider?.trim();
  const model = row.model?.trim();
  const modelDisplay = provider && model ? `${provider}/${model}` : model || provider || "unknown";
  const totalTokens = row.totalTokens ?? null;
  const contextTokens = row.contextTokens ?? null;
  const contextPercent = totalTokens !== null && contextTokens ? Math.round((totalTokens / contextTokens) * 100) : null;
  const thinking = row.thinkingLevel?.trim() || "off";
  const windows = normalizeUsageWindows(usage, provider);

  const lines = [
    `🧠 Model: ${modelDisplay}`,
    `🧮 Tokens: ${row.inputTokens ?? 0} in / ${row.outputTokens ?? 0} out`,
    `📚 Context: ${formatCompact(totalTokens)} / ${formatCompact(contextTokens)}${contextPercent !== null ? ` (${contextPercent}%)` : ""}`,
    `📊 Usage: ${formatUsageWindow("5h", windows.fiveHour)} · ${formatUsageWindow("Week", windows.week)}`,
    `⚙️ Runtime: gateway-cli · Think: ${thinking}`
  ];

  return lines.join("\n");
}

function normalizeUsageWindows(usage: UsageStatusResult | null, provider: string | undefined) {
  const windows = usage?.providers?.find((entry) => {
    if (!provider) {
      return true;
    }
    return entry.provider === provider;
  })?.windows ?? [];

  return {
    fiveHour: findUsageWindow(windows, "5h"),
    week: findUsageWindow(windows, "Week")
  };
}

function findUsageWindow(
  windows: NonNullable<NonNullable<UsageStatusResult["providers"]>[number]["windows"]>,
  label: string
) {
  return windows.find((entry) => entry.label?.toLowerCase() === label.toLowerCase()) ?? null;
}

function formatUsageWindow(
  label: string,
  window: { label?: string; usedPercent?: number; resetAt?: number } | null
): string {
  if (!window || typeof window.usedPercent !== "number") {
    return `${label} n/a`;
  }

  const leftPercent = Math.max(0, 100 - window.usedPercent);
  const resetChunk = typeof window.resetAt === "number" ? ` ⏱${formatRemaining(window.resetAt - Date.now())}` : "";
  return `${label} ${leftPercent}% left${resetChunk}`;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && parts.length < 2) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${totalSeconds}s`);

  return parts.slice(0, 2).join(" ");
}

function formatCompact(value: number | null | undefined): string {
  if (value == null) {
    return "n/a";
  }

  if (value >= 1000_000) {
    return `${stripTrailingZero((value / 1000_000).toFixed(1))}m`;
  }

  if (value >= 1000) {
    return `${stripTrailingZero((value / 1000).toFixed(1))}k`;
  }

  return String(value);
}

function stripTrailingZero(value: string): string {
  return value.replace(/\.0$/, "");
}

export const __testOnly = {
  buildSyntheticStatus,
  formatRemaining,
  formatCompact
};
