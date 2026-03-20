import type { DiscoveredSession, SessionKind } from "./types.js";

export function classifySession(sessionKey: string): SessionKind {
  if (sessionKey.includes("subagent")) {
    return "subagent";
  }

  if (sessionKey.includes("agent:main:")) {
    return "main";
  }

  return "other";
}

export interface SessionLister {
  list(): Promise<DiscoveredSession[]>;
}

export function normalizeDiscoveredSession(input: {
  sessionKey: string;
  label?: string | null;
  updatedAt?: string | null;
}): DiscoveredSession {
  return {
    sessionKey: input.sessionKey,
    label: input.label?.trim() || input.sessionKey,
    kind: classifySession(input.sessionKey),
    updatedAt: input.updatedAt ?? null
  };
}
