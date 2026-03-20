import type { TelegramConfig } from "./config.js";
import { handleCommand } from "./commands.js";
import type { CommandContext } from "./commands.js";
import type { OverviewView } from "./format.js";
import type { SchedulerDeps } from "./scheduler.js";
import { runCollectionCycle } from "./scheduler.js";

interface TelegramUpdateResponse {
  ok: boolean;
  result: TelegramUpdate[];
  description?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: {
    id: number | string;
    type: string;
  };
}

interface TelegramReplyKeyboardMarkup {
  keyboard: string[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
  input_field_placeholder?: string;
}

interface TelegramBotCommand {
  command: string;
  description: string;
}

interface TelegramApiOkResponse {
  ok: boolean;
  description?: string;
}

export interface TelegramSendMessageOptions {
  keyboard?: TelegramReplyKeyboardMarkup;
}

export interface TelegramBotRuntime {
  stop(): void;
}

const COMMAND_KEYBOARD: TelegramReplyKeyboardMarkup = {
  keyboard: [
    ["总览", "会话列表"],
    ["最近消耗", "订阅状态"],
    ["开启推送", "关闭推送"],
    ["/help"]
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "点按钮或直接输入命令"
};

const BOT_COMMANDS: TelegramBotCommand[] = [
  { command: "start", description: "查看欢迎说明与快捷按钮" },
  { command: "help", description: "查看可用命令" },
  { command: "overview", description: "查看总览" },
  { command: "sessions", description: "查看会话列表" },
  { command: "usage", description: "查看最近消耗" },
  { command: "subscription", description: "查看订阅状态" },
  { command: "push_on", description: "开启推送" },
  { command: "push_off", description: "关闭推送" }
];

export function startTelegramCommandBot(config: TelegramConfig, deps: SchedulerDeps, context: CommandContext): TelegramBotRuntime | null {
  if (!config.botToken) {
    return null;
  }

  let stopped = false;
  let offset: number | undefined;
  let running = false;

  void ensureTelegramBotUi(config).catch((error) => {
    console.error("quota-bot telegram UI bootstrap failed", error);
  });

  const loop = async () => {
    if (stopped || running) {
      return;
    }

    running = true;
    try {
      const updates = await getUpdates(config, offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update, config, deps, context);
      }
    } catch (error) {
      console.error("quota-bot telegram polling failed", error);
    } finally {
      running = false;
      if (!stopped) {
        setTimeout(() => {
          void loop();
        }, 1000);
      }
    }
  };

  void loop();

  return {
    stop() {
      stopped = true;
    }
  };
}

async function handleUpdate(
  update: TelegramUpdate,
  config: TelegramConfig,
  deps: SchedulerDeps,
  context: CommandContext
): Promise<void> {
  const message = update.message;
  if (!message?.text) {
    return;
  }

  const chatId = String(message.chat.id);
  if (config.chatId && chatId !== config.chatId) {
    return;
  }

  const text = message.text.trim();
  if (!text) {
    return;
  }

  if (text === "/start") {
    await runCollectionCycle(deps);
    const overview = await context.getOverview();
    const subscription = await context.getSubscriptionStatus();
    await sendTelegramMessage(config, chatId, buildStartMessage(overview, subscription), {
      keyboard: COMMAND_KEYBOARD
    });
    return;
  }

  if (text === "/help") {
    await sendTelegramMessage(config, chatId, buildHelpMessage(), {
      keyboard: COMMAND_KEYBOARD
    });
    return;
  }

  await runCollectionCycle(deps);
  const reply = await handleCommand(normalizeTelegramInput(text), context);
  await sendTelegramMessage(config, chatId, reply, {
    keyboard: COMMAND_KEYBOARD
  });
}

async function getUpdates(config: TelegramConfig, offset?: number): Promise<TelegramUpdate[]> {
  const response = await fetch(`${config.apiBaseUrl}/bot${config.botToken}/getUpdates`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      offset,
      timeout: 20,
      allowed_updates: ["message"]
    })
  });

  if (!response.ok) {
    throw new Error(`telegram getUpdates failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TelegramUpdateResponse;
  if (!payload.ok) {
    throw new Error(`telegram getUpdates rejected: ${payload.description ?? "unknown error"}`);
  }

  return payload.result;
}

async function ensureTelegramBotUi(config: TelegramConfig): Promise<void> {
  await callTelegramApi(config, "setMyCommands", {
    commands: BOT_COMMANDS
  });
}

export async function sendTelegramMessage(
  config: TelegramConfig,
  chatId: string,
  text: string,
  options: TelegramSendMessageOptions = {}
): Promise<void> {
  for (const chunk of splitTelegramMessage(text)) {
    await callTelegramApi(config, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
      ...(options.keyboard ? { reply_markup: options.keyboard } : {})
    });
  }
}

async function callTelegramApi(config: TelegramConfig, method: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${config.apiBaseUrl}/bot${config.botToken}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`telegram ${method} failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TelegramApiOkResponse;
  if (!payload.ok) {
    throw new Error(`telegram ${method} rejected: ${payload.description ?? "unknown error"}`);
  }
}

function buildStartMessage(overview: OverviewView, subscriptionStatus: string): string {
  return [
    "你好，我是 quota-bot。",
    "",
    `当前活跃会话：${overview.activeCount}`,
    `5h 剩余：${formatPct(overview.fiveHourLeftPct)}`,
    `Week 剩余：${formatPct(overview.weekLeftPct)}`,
    subscriptionStatus.split("\n")[0] ?? "",
    "",
    "常用方式：直接点底部按钮，不用死记命令。",
    "",
    "可用命令：",
    "- 总览",
    "- 会话列表",
    "- 查看 <会话>",
    "- 最近消耗"
  ].filter(Boolean).join("\n");
}

function buildHelpMessage(): string {
  return [
    "你好，我是 quota-bot。",
    "",
    "常用方式：直接点底部按钮，不用死记命令。",
    "",
    "可用命令：",
    "- 总览",
    "- 会话列表",
    "- 查看 <会话>",
    "- 最近消耗",
    "- 订阅状态",
    "- 开启推送 / 关闭推送",
    "",
    "也支持：/overview /sessions /usage /subscription /push_on /push_off"
  ].join("\n");
}

function formatPct(value: number | null): string {
  return value === null ? "暂无数据" : `${value}%`;
}

function normalizeTelegramInput(input: string): string {
  const trimmed = input.trim();
  const mapping: Record<string, string> = {
    "/overview": "总览",
    "/sessions": "会话列表",
    "/usage": "最近消耗",
    "/subscription": "订阅状态",
    "/push_on": "开启推送",
    "/push_off": "关闭推送"
  };

  if (trimmed.startsWith("/view ")) {
    return `查看 ${trimmed.slice("/view ".length).trim()}`;
  }

  return mapping[trimmed] ?? trimmed;
}

export function splitTelegramMessage(text: string, maxLength = 4000): string[] {
  const normalized = text.trim();
  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    const slice = remaining.slice(0, maxLength);
    const splitIndex = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const end = splitIndex > maxLength * 0.6 ? splitIndex : maxLength;
    chunks.push(remaining.slice(0, end).trimEnd());
    remaining = remaining.slice(end).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export const __testOnly = {
  buildHelpMessage,
  buildStartMessage,
  normalizeTelegramInput,
  splitTelegramMessage,
  COMMAND_KEYBOARD,
  BOT_COMMANDS
};
