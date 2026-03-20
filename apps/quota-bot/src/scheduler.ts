import { collectOne, type StatusFetcher } from "./collector.js";
import type { PushPolicy } from "./config.js";
import { detectQuotaWarnings, diffSnapshots } from "./diff.js";
import { flushPendingPushes, type PushSink } from "./pusher.js";
import type { SessionLister } from "./session-discovery.js";
import { normalizeDiscoveredSession } from "./session-discovery.js";
import type { Store } from "./store.js";
import type { DiscoveredSession } from "./types.js";

export interface CollectionCycleResult {
  discoveredCount: number;
  snapshotsInserted: number;
  eventsInserted: number;
  batchesSent: number;
  prunedSnapshots: number;
}

export interface PushState {
  enabled: boolean;
}

export interface SchedulerDeps {
  sessionLister: SessionLister;
  statusFetcher: StatusFetcher;
  pushSink: PushSink;
  store: Store;
  policy: PushPolicy;
  retentionDays: number;
  pushState: PushState;
}

export async function runCollectionCycle(deps: SchedulerDeps): Promise<CollectionCycleResult> {
  const discovered = (await deps.sessionLister.list()).map(normalizeDiscoveredSessionRow);
  const seenAt = new Date().toISOString();
  let snapshotsInserted = 0;
  let eventsInserted = 0;

  for (const session of discovered) {
    deps.store.upsertSession({
      sessionKey: session.sessionKey,
      label: session.label,
      kind: session.kind,
      owner: null,
      firstSeenAt: session.updatedAt ?? seenAt,
      lastSeenAt: session.updatedAt ?? seenAt,
      isActive: true
    });

    const before = deps.store.getLatestSnapshot(session.sessionKey);
    const snapshot = await collectOne(deps.statusFetcher, session.sessionKey);
    const snapshotId = deps.store.insertSnapshot(snapshot);
    snapshotsInserted += 1;

    const diff = diffSnapshots(before, snapshot);
    if (diff) {
      deps.store.insertUsageEvent({
        event: diff,
        fromSnapshotId: before?.id ?? null,
        toSnapshotId: snapshotId,
        createdAt: snapshot.capturedAt
      });
      eventsInserted += 1;
    }

    for (const warning of detectQuotaWarnings(before, snapshot)) {
      deps.store.insertUsageEvent({
        event: warning,
        fromSnapshotId: before?.id ?? null,
        toSnapshotId: snapshotId,
        createdAt: snapshot.capturedAt
      });
      eventsInserted += 1;
    }
  }

  deps.store.markMissingSessionsInactive(discovered.map((session) => session.sessionKey), seenAt);

  const cutoff = new Date(Date.now() - deps.retentionDays * 86400_000).toISOString();
  const pruneResult = deps.store.pruneOldSnapshots(cutoff);

  let batchesSent = 0;
  if (deps.pushState.enabled) {
    const batches = await flushPendingPushes(deps.store, deps.pushSink, deps.policy);
    batchesSent = batches.length;
  }

  return {
    discoveredCount: discovered.length,
    snapshotsInserted,
    eventsInserted,
    batchesSent,
    prunedSnapshots: pruneResult.snapshotsDeleted
  };
}

export function startScheduler(deps: SchedulerDeps, intervalMs: number): NodeJS.Timeout {
  const timer = setInterval(() => {
    void runCollectionCycle(deps).catch((error: unknown) => {
      console.error("quota-bot collection cycle failed", error);
    });
  }, intervalMs);

  return timer;
}

function normalizeDiscoveredSessionRow(session: DiscoveredSession): DiscoveredSession {
  return normalizeDiscoveredSession(session);
}
