import type { Snapshot, UsageEvent } from "./types.js";

export function diffSnapshots(before: Snapshot | null, after: Snapshot): UsageEvent | null {
  if (!before) {
    return null;
  }

  const beforeIn = before.tokensIn ?? 0;
  const beforeOut = before.tokensOut ?? 0;
  const beforeContext = before.contextUsed ?? 0;
  const afterIn = after.tokensIn ?? 0;
  const afterOut = after.tokensOut ?? 0;
  const afterContext = after.contextUsed ?? 0;

  if (afterIn < beforeIn || afterOut < beforeOut || afterContext < beforeContext) {
    return {
      sessionKey: after.sessionKey,
      eventType: "reset_or_rollover",
      deltaTokensIn: null,
      deltaTokensOut: null,
      deltaContext: null
    };
  }

  const deltaTokensIn = afterIn - beforeIn;
  const deltaTokensOut = afterOut - beforeOut;
  const deltaContext = afterContext - beforeContext;

  if (deltaTokensIn === 0 && deltaTokensOut === 0 && deltaContext === 0) {
    return null;
  }

  return {
    sessionKey: after.sessionKey,
    eventType: "normal",
    deltaTokensIn,
    deltaTokensOut,
    deltaContext
  };
}

export function detectQuotaWarnings(before: Snapshot | null, after: Snapshot): UsageEvent[] {
  const events: UsageEvent[] = [];

  addThresholdEvent(events, before?.fiveHourLeftPct ?? null, after.fiveHourLeftPct ?? null, [30, 15, 5], after, "fiveHour");
  addThresholdEvent(events, before?.weekLeftPct ?? null, after.weekLeftPct ?? null, [40, 20, 10], after, "week");
  addThresholdEvent(
    events,
    contextPercent(before),
    contextPercent(after),
    [70, 85, 95],
    after,
    "context"
  );

  return events;
}

function addThresholdEvent(
  events: UsageEvent[],
  beforeValue: number | null,
  afterValue: number | null,
  thresholds: number[],
  snapshot: Snapshot,
  kind: "fiveHour" | "week" | "context"
): void {
  if (afterValue === null) {
    return;
  }

  for (const threshold of thresholds) {
    if (kind === "context") {
      const crossed = (beforeValue ?? 0) < threshold && afterValue >= threshold;
      if (crossed) {
        events.push({
          sessionKey: snapshot.sessionKey,
          eventType: "context_warning",
          deltaTokensIn: null,
          deltaTokensOut: null,
          deltaContext: null,
          thresholdKind: kind,
          thresholdValue: threshold
        });
      }
      continue;
    }

    const crossed = (beforeValue ?? 101) > threshold && afterValue <= threshold;
    if (crossed) {
      events.push({
        sessionKey: snapshot.sessionKey,
        eventType: "quota_warning",
        deltaTokensIn: null,
        deltaTokensOut: null,
        deltaContext: null,
        thresholdKind: kind,
        thresholdValue: threshold
      });
    }
  }
}

function contextPercent(snapshot: Snapshot | null): number | null {
  if (!snapshot?.contextUsed || !snapshot.contextMax) {
    return null;
  }
  return (snapshot.contextUsed / snapshot.contextMax) * 100;
}
