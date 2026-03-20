export type SessionKind = "main" | "subagent" | "other";

export interface Snapshot {
  sessionKey: string;
  capturedAt: string;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  contextUsed: number | null;
  contextMax: number | null;
  fiveHourLeftPct?: number | null;
  fiveHourResetInSec?: number | null;
  weekLeftPct?: number | null;
  weekResetInSec?: number | null;
  thinking?: string | null;
  rawStatusText?: string | null;
}

export interface DiscoveredSession {
  sessionKey: string;
  label: string;
  kind: SessionKind;
  updatedAt: string | null;
}

export type UsageEventType = "normal" | "reset_or_rollover" | "quota_warning" | "context_warning";
export type ThresholdKind = "fiveHour" | "week" | "context";

export interface UsageEvent {
  sessionKey: string;
  eventType: UsageEventType;
  deltaTokensIn: number | null;
  deltaTokensOut: number | null;
  deltaContext: number | null;
  thresholdKind?: ThresholdKind;
  thresholdValue?: number;
}

export interface UsageEventRecord extends UsageEvent {
  id: number;
  fromSnapshotId: number | null;
  toSnapshotId: number;
  createdAt: string;
  pushedAt: string | null;
  pushStatus: string | null;
}

export interface SessionSnapshotRow extends Snapshot {
  id: number;
}
