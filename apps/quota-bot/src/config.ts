export interface PushPolicy {
  normalMergeWindowMs: number;
  fiveHourThresholds: number[];
  weekThresholds: number[];
  contextThresholds: number[];
}

export interface TelegramConfig {
  botToken: string | null;
  chatId: string | null;
  apiBaseUrl: string;
}

export interface AppConfig {
  dbPath: string;
  pollIntervalMs: number;
  retentionDays: number;
  pushEnabled: boolean;
  pushPolicy: PushPolicy;
  telegram: TelegramConfig;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function readThresholds(name: string, fallback: number[]): number[] {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const values = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));

  return values.length > 0 ? values : fallback;
}

function readOptionalString(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw ? raw : null;
}

export function loadConfig(): AppConfig {
  return {
    dbPath: process.env.QUOTA_BOT_DB_PATH ?? "./data/quota-bot.sqlite",
    pollIntervalMs: readNumber("QUOTA_BOT_POLL_INTERVAL_MS", 60_000),
    retentionDays: readNumber("QUOTA_BOT_RETENTION_DAYS", 30),
    pushEnabled: readBoolean("QUOTA_BOT_PUSH_ENABLED", true),
    pushPolicy: {
      normalMergeWindowMs: readNumber("QUOTA_BOT_NORMAL_MERGE_WINDOW_MS", 5 * 60_000),
      fiveHourThresholds: readThresholds("QUOTA_BOT_FIVE_HOUR_THRESHOLDS", [30, 15, 5]),
      weekThresholds: readThresholds("QUOTA_BOT_WEEK_THRESHOLDS", [40, 20, 10]),
      contextThresholds: readThresholds("QUOTA_BOT_CONTEXT_THRESHOLDS", [70, 85, 95])
    },
    telegram: {
      botToken: readOptionalString("QUOTA_BOT_TELEGRAM_BOT_TOKEN"),
      chatId: readOptionalString("QUOTA_BOT_TELEGRAM_CHAT_ID"),
      apiBaseUrl: process.env.QUOTA_BOT_TELEGRAM_API_BASE?.trim() || "https://api.telegram.org"
    }
  };
}
