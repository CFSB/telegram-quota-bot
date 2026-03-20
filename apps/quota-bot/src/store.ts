import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  SessionKind,
  SessionSnapshotRow,
  Snapshot,
  UsageEvent,
  UsageEventRecord
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolveSchemaPath();

function resolveSchemaPath(): string {
  const localPath = join(__dirname, "schema.sql");
  if (existsSync(localPath)) {
    return localPath;
  }

  const cwdPath = join(process.cwd(), "src", "schema.sql");
  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  throw new Error(`quota-bot schema.sql not found (checked ${localPath} and ${cwdPath})`);
}

export interface SessionRecord {
  sessionKey: string;
  label: string | null;
  kind: SessionKind;
  owner: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
}

export interface InsertSnapshotInput extends Snapshot {
  fiveHourLeftPct?: number | null;
  fiveHourResetInSec?: number | null;
  weekLeftPct?: number | null;
  weekResetInSec?: number | null;
  thinking?: string | null;
  rawStatusText?: string | null;
}

export interface Store {
  upsertSession(session: SessionRecord): void;
  markMissingSessionsInactive(activeSessionKeys: string[], seenAt: string): number;
  insertSnapshot(snapshot: InsertSnapshotInput): number;
  getLatestSnapshot(sessionKey: string): SessionSnapshotRow | null;
  listActiveSessions(): SessionRecord[];
  insertUsageEvent(input: {
    event: UsageEvent;
    fromSnapshotId: number | null;
    toSnapshotId: number;
    createdAt: string;
  }): number;
  listRecentUsageEvents(limit?: number): UsageEventRecord[];
  listPendingUsageEvents(): UsageEventRecord[];
  markEventsPushed(eventIds: number[], pushedAt: string, pushStatus: string): void;
  pruneOldSnapshots(cutoffIso: string): { snapshotsDeleted: number; usageEventsDeleted: number };
  getDatabase(): Database.Database;
}

export function createStore(input: { dbPath: string }): Store {
  mkdirSync(dirname(input.dbPath), { recursive: true });

  const db = new Database(input.dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(readFileSync(schemaPath, "utf8"));

  const upsertSessionStmt = db.prepare(`
    INSERT INTO sessions (
      session_key,
      label,
      kind,
      owner,
      first_seen_at,
      last_seen_at,
      is_active
    ) VALUES (
      @sessionKey,
      @label,
      @kind,
      @owner,
      @firstSeenAt,
      @lastSeenAt,
      @isActive
    )
    ON CONFLICT(session_key) DO UPDATE SET
      label = excluded.label,
      kind = excluded.kind,
      owner = excluded.owner,
      last_seen_at = excluded.last_seen_at,
      is_active = excluded.is_active
  `);

  const markMissingSessionsInactiveStmt = db.prepare(`
    UPDATE sessions
    SET is_active = 0,
        last_seen_at = @seenAt
    WHERE is_active = 1
      AND session_key NOT IN (SELECT value FROM json_each(@activeSessionKeys))
  `);

  const insertSnapshotStmt = db.prepare(`
    INSERT INTO snapshots (
      session_key,
      captured_at,
      model,
      tokens_in,
      tokens_out,
      context_used,
      context_max,
      five_hour_left_pct,
      five_hour_reset_in_sec,
      week_left_pct,
      week_reset_in_sec,
      thinking,
      raw_status_text
    ) VALUES (
      @sessionKey,
      @capturedAt,
      @model,
      @tokensIn,
      @tokensOut,
      @contextUsed,
      @contextMax,
      @fiveHourLeftPct,
      @fiveHourResetInSec,
      @weekLeftPct,
      @weekResetInSec,
      @thinking,
      @rawStatusText
    )
  `);

  const getLatestSnapshotStmt = db.prepare(`
    SELECT
      id,
      session_key as sessionKey,
      captured_at as capturedAt,
      model,
      tokens_in as tokensIn,
      tokens_out as tokensOut,
      context_used as contextUsed,
      context_max as contextMax,
      five_hour_left_pct as fiveHourLeftPct,
      five_hour_reset_in_sec as fiveHourResetInSec,
      week_left_pct as weekLeftPct,
      week_reset_in_sec as weekResetInSec,
      thinking,
      raw_status_text as rawStatusText
    FROM snapshots
    WHERE session_key = ?
    ORDER BY captured_at DESC, id DESC
    LIMIT 1
  `) as Database.Statement<[string], SessionSnapshotRow>;

  const listActiveSessionsStmt = db.prepare(`
    SELECT
      session_key as sessionKey,
      label,
      kind,
      owner,
      first_seen_at as firstSeenAt,
      last_seen_at as lastSeenAt,
      is_active as isActive
    FROM sessions
    WHERE is_active = 1
    ORDER BY last_seen_at DESC, session_key ASC
  `) as Database.Statement<[], {
    sessionKey: string;
    label: string | null;
    kind: SessionKind;
    owner: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    isActive: number;
  }>;

  const insertUsageEventStmt = db.prepare(`
    INSERT INTO usage_events (
      session_key,
      from_snapshot_id,
      to_snapshot_id,
      delta_tokens_in,
      delta_tokens_out,
      delta_context,
      event_type,
      created_at,
      pushed_at,
      push_status
    ) VALUES (
      @sessionKey,
      @fromSnapshotId,
      @toSnapshotId,
      @deltaTokensIn,
      @deltaTokensOut,
      @deltaContext,
      @eventType,
      @createdAt,
      NULL,
      NULL
    )
  `);

  const listRecentUsageEventsStmt = db.prepare(`
    SELECT
      id,
      session_key as sessionKey,
      from_snapshot_id as fromSnapshotId,
      to_snapshot_id as toSnapshotId,
      delta_tokens_in as deltaTokensIn,
      delta_tokens_out as deltaTokensOut,
      delta_context as deltaContext,
      event_type as eventType,
      created_at as createdAt,
      pushed_at as pushedAt,
      push_status as pushStatus
    FROM usage_events
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `) as Database.Statement<[number], UsageEventRecord>;

  const listPendingUsageEventsStmt = db.prepare(`
    SELECT
      id,
      session_key as sessionKey,
      from_snapshot_id as fromSnapshotId,
      to_snapshot_id as toSnapshotId,
      delta_tokens_in as deltaTokensIn,
      delta_tokens_out as deltaTokensOut,
      delta_context as deltaContext,
      event_type as eventType,
      created_at as createdAt,
      pushed_at as pushedAt,
      push_status as pushStatus
    FROM usage_events
    WHERE pushed_at IS NULL
    ORDER BY created_at ASC, id ASC
  `) as Database.Statement<[], UsageEventRecord>;

  const markEventPushedStmt = db.prepare(`
    UPDATE usage_events
    SET pushed_at = @pushedAt,
        push_status = @pushStatus
    WHERE id = @id
  `);

  const pruneUsageEventsStmt = db.prepare(`
    DELETE FROM usage_events
    WHERE to_snapshot_id IN (
      SELECT id FROM snapshots WHERE captured_at < ?
    )
       OR (from_snapshot_id IS NOT NULL AND from_snapshot_id IN (
         SELECT id FROM snapshots WHERE captured_at < ?
       ))
  `);

  const pruneSnapshotsStmt = db.prepare(`
    DELETE FROM snapshots WHERE captured_at < ?
  `);

  const markEventsPushedTxn = db.transaction((eventIds: number[], pushedAt: string, pushStatus: string) => {
    for (const id of eventIds) {
      markEventPushedStmt.run({ id, pushedAt, pushStatus });
    }
  });

  return {
    upsertSession(session) {
      upsertSessionStmt.run({
        ...session,
        isActive: session.isActive ? 1 : 0
      });
    },
    markMissingSessionsInactive(activeSessionKeys, seenAt) {
      const keysJson = JSON.stringify(activeSessionKeys);
      const result = markMissingSessionsInactiveStmt.run({ activeSessionKeys: keysJson, seenAt });
      return result.changes;
    },
    insertSnapshot(snapshot) {
      const result = insertSnapshotStmt.run({
        fiveHourLeftPct: null,
        fiveHourResetInSec: null,
        weekLeftPct: null,
        weekResetInSec: null,
        thinking: null,
        rawStatusText: null,
        ...snapshot
      });
      return Number(result.lastInsertRowid);
    },
    getLatestSnapshot(sessionKey) {
      return getLatestSnapshotStmt.get(sessionKey) ?? null;
    },
    listActiveSessions() {
      return listActiveSessionsStmt.all().map((row) => ({
        sessionKey: row.sessionKey,
        label: row.label,
        kind: row.kind,
        owner: row.owner,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        isActive: Boolean(row.isActive)
      }));
    },
    insertUsageEvent(input) {
      const result = insertUsageEventStmt.run({
        sessionKey: input.event.sessionKey,
        fromSnapshotId: input.fromSnapshotId,
        toSnapshotId: input.toSnapshotId,
        deltaTokensIn: input.event.deltaTokensIn,
        deltaTokensOut: input.event.deltaTokensOut,
        deltaContext: input.event.deltaContext,
        eventType: formatEventType(input.event),
        createdAt: input.createdAt
      });
      return Number(result.lastInsertRowid);
    },
    listRecentUsageEvents(limit = 20) {
      return listRecentUsageEventsStmt.all(limit).map(parseEventRecord);
    },
    listPendingUsageEvents() {
      return listPendingUsageEventsStmt.all().map(parseEventRecord);
    },
    markEventsPushed(eventIds, pushedAt, pushStatus) {
      if (eventIds.length === 0) {
        return;
      }
      markEventsPushedTxn(eventIds, pushedAt, pushStatus);
    },
    pruneOldSnapshots(cutoffIso) {
      const usageEventsDeleted = pruneUsageEventsStmt.run(cutoffIso, cutoffIso).changes;
      const snapshotsDeleted = pruneSnapshotsStmt.run(cutoffIso).changes;
      return { snapshotsDeleted, usageEventsDeleted };
    },
    getDatabase() {
      return db;
    }
  };
}

function formatEventType(event: UsageEvent): string {
  if (event.eventType === "quota_warning" || event.eventType === "context_warning") {
    return `${event.eventType}:${event.thresholdKind ?? "unknown"}:${event.thresholdValue ?? "na"}`;
  }
  return event.eventType;
}

function parseEventRecord(row: UsageEventRecord): UsageEventRecord {
  const [eventType, thresholdKind, thresholdValue] = row.eventType.split(":");
  const base: UsageEventRecord = {
    ...row,
    eventType: eventType as UsageEventRecord["eventType"],
    thresholdKind: undefined,
    thresholdValue: undefined
  };

  if (eventType === "quota_warning" || eventType === "context_warning") {
    base.thresholdKind = thresholdKind as UsageEventRecord["thresholdKind"];
    base.thresholdValue = thresholdValue ? Number(thresholdValue) : undefined;
  }

  return base;
}
