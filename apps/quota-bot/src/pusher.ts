import type { PushPolicy } from "./config.js";
import { formatSessionDisplayName, isMeaningfulUsageEvent } from "./session-display.js";
import type { UsageEventRecord } from "./types.js";

export interface PushBatch {
  eventIds: number[];
  mode: "merged_normal" | "immediate_alert";
  text: string;
}

export interface PushSink {
  sendMessage(text: string): Promise<void>;
}

export interface PushStore {
  listPendingUsageEvents(): UsageEventRecord[];
  markEventsPushed(eventIds: number[], pushedAt: string, pushStatus: string): void;
}

export function buildPushBatches(events: UsageEventRecord[], policy: PushPolicy): PushBatch[] {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const batches: PushBatch[] = [];
  let normalBucket: UsageEventRecord[] = [];

  const flushNormalBucket = () => {
    if (normalBucket.length === 0) {
      return;
    }

    batches.push({
      eventIds: normalBucket.map((event) => event.id),
      mode: "merged_normal",
      text: formatNormalBatch(normalBucket)
    });
    normalBucket = [];
  };

  for (const event of sorted) {
    if (event.eventType !== "normal") {
      flushNormalBucket();
      batches.push({
        eventIds: [event.id],
        mode: "immediate_alert",
        text: formatAlert(event)
      });
      continue;
    }

    const previous = normalBucket.at(-1);
    if (!previous) {
      normalBucket.push(event);
      continue;
    }

    const withinWindow = new Date(event.createdAt).getTime() - new Date(previous.createdAt).getTime() <= policy.normalMergeWindowMs;
    if (withinWindow) {
      normalBucket.push(event);
      continue;
    }

    flushNormalBucket();
    normalBucket.push(event);
  }

  flushNormalBucket();
  return batches;
}

export async function flushPendingPushes(store: PushStore, sink: PushSink, policy: PushPolicy): Promise<PushBatch[]> {
  const events = store.listPendingUsageEvents();
  const ignored = events.filter(shouldIgnorePushEvent);
  if (ignored.length > 0) {
    store.markEventsPushed(
      ignored.map((event) => event.id),
      new Date().toISOString(),
      "ignored"
    );
  }

  const activeEvents = events.filter((event) => !shouldIgnorePushEvent(event));
  const batches = buildPushBatches(activeEvents, policy);

  for (const batch of batches) {
    await sink.sendMessage(batch.text);
    store.markEventsPushed(batch.eventIds, new Date().toISOString(), batch.mode);
  }

  return batches;
}

function formatNormalBatch(events: UsageEventRecord[]): string {
  const sessionCount = new Set(events.map((event) => event.sessionKey)).size;
  const totalIn = sum(events.map((event) => event.deltaTokensIn ?? 0));
  const totalOut = sum(events.map((event) => event.deltaTokensOut ?? 0));
  const totalContext = sum(events.map((event) => event.deltaContext ?? 0));

  const details = events
    .map((event) => `- ${formatSessionDisplayName({ sessionKey: event.sessionKey })}: +${event.deltaTokensIn ?? 0} in / +${event.deltaTokensOut ?? 0} out / +${event.deltaContext ?? 0} ctx`)
    .join("\n");

  return [
    `合并推送：${events.length} 条事件，${sessionCount} 个会话`,
    `合计：+${totalIn} in / +${totalOut} out / +${totalContext} ctx`,
    details
  ].join("\n");
}

function formatAlert(event: UsageEventRecord): string {
  if (event.eventType === "reset_or_rollover") {
    return `重置提醒：${formatSessionDisplayName({ sessionKey: event.sessionKey })} 的计数发生回退，已按 rollover 处理。`;
  }

  if (event.eventType === "quota_warning") {
    const kindLabel = event.thresholdKind === "fiveHour" ? "5h" : "Week";
    return `额度告警：${formatSessionDisplayName({ sessionKey: event.sessionKey })} 的 ${kindLabel} 剩余已到 ${event.thresholdValue}% 阈值。`;
  }

  if (event.eventType === "context_warning") {
    return `上下文告警：${formatSessionDisplayName({ sessionKey: event.sessionKey })} 已达到 ${event.thresholdValue}% 上下文阈值。`;
  }

  return `使用事件：${formatSessionDisplayName({ sessionKey: event.sessionKey })}`;
}

function shouldIgnorePushEvent(event: UsageEventRecord): boolean {
  if (event.eventType === "reset_or_rollover") {
    return true;
  }

  return !isMeaningfulUsageEvent(event);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
