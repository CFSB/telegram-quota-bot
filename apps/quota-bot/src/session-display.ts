import type { SessionRecord } from "./store.js";

export function formatSessionDisplayName(input: {
  sessionKey: string;
  label?: string | null;
  kind?: string | null;
}): string {
  const { sessionKey, label } = input;

  if (sessionKey === "agent:main:main") {
    return "主会话（Web）";
  }

  if (sessionKey.includes(":telegram:direct:")) {
    return "主会话（Telegram 私聊）";
  }

  if (sessionKey.includes(":telegram:slash:")) {
    return "Telegram Slash 会话";
  }

  if (sessionKey.includes("subagent")) {
    const cleaned = label?.trim();
    return cleaned && cleaned !== sessionKey ? `${cleaned}（子代理）` : "子代理会话";
  }

  const cleaned = label?.trim();
  if (cleaned && cleaned !== sessionKey) {
    return cleaned;
  }

  return sessionKey;
}

export function formatSessionRecord(session: SessionRecord): string {
  return formatSessionDisplayName({
    sessionKey: session.sessionKey,
    label: session.label,
    kind: session.kind
  });
}

export function isMeaningfulUsageEvent(event: {
  eventType: string;
  deltaTokensIn: number | null;
  deltaTokensOut: number | null;
  deltaContext: number | null;
}): boolean {
  if (event.eventType !== "normal") {
    return true;
  }

  return (event.deltaTokensIn ?? 0) > 0 || (event.deltaTokensOut ?? 0) > 0 || (event.deltaContext ?? 0) > 0;
}
