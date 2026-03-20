import { formatOverview, formatSessionList, type OverviewView, type SessionListItemView } from "./format.js";

export interface CommandContext {
  getOverview(): Promise<OverviewView>;
  listSessions(): Promise<SessionListItemView[]>;
  getSessionDetail(query: string): Promise<string>;
  getRecentUsage(): Promise<string>;
  getSubscriptionStatus(): Promise<string>;
  enablePush(): Promise<string>;
  disablePush(): Promise<string>;
}

export async function handleCommand(input: string, context: CommandContext): Promise<string> {
  const trimmed = normalizeCommand(input);

  if (trimmed === "总览") {
    return formatOverview(await context.getOverview());
  }
  if (trimmed === "会话列表") {
    return formatSessionList(await context.listSessions());
  }
  if (trimmed.startsWith("查看 ")) {
    return context.getSessionDetail(trimmed.slice(3).trim());
  }
  if (trimmed === "最近消耗") {
    return context.getRecentUsage();
  }
  if (trimmed === "订阅状态") {
    return context.getSubscriptionStatus();
  }
  if (trimmed === "开启推送") {
    return context.enablePush();
  }
  if (trimmed === "关闭推送") {
    return context.disablePush();
  }

  return "不支持的命令";
}

function normalizeCommand(input: string): string {
  const trimmed = input.trim();
  const withoutQueryPrefix = trimmed.replace(/^查询/, "").trim();

  if (["总揽", "纵览"].includes(withoutQueryPrefix)) {
    return "总览";
  }

  return withoutQueryPrefix;
}
