# Quota Monitor Bot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone TypeScript/Node monitoring bot that tracks the user's own OpenClaw sessions and subagents, stores status snapshots in SQLite, computes usage deltas, and serves manual query plus push-notification workflows.

**Architecture:** Create a small app under `apps/quota-bot/` with separate modules for discovery, collection, storage, diffing, formatting, commands, and scheduling. Persist session/snapshot/event data in SQLite so the bot can answer current-state queries and recent-usage history from one local source of truth.

**Tech Stack:** Node.js 22, TypeScript, SQLite, a Telegram/OpenClaw-facing command adapter, Node test runner or Vitest, npm.

---

### Task 1: Bootstrap the standalone app

**Files:**
- Create: `apps/quota-bot/package.json`
- Create: `apps/quota-bot/tsconfig.json`
- Create: `apps/quota-bot/src/index.ts`
- Create: `apps/quota-bot/src/types.ts`
- Create: `apps/quota-bot/src/config.ts`
- Create: `apps/quota-bot/README.md`

**Step 1: Create the package manifest**

```json
{
  "name": "quota-bot",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "check": "tsc -p tsconfig.json --noEmit",
    "test": "node --test",
    "start": "node dist/index.js"
  }
}
```

**Step 2: Create a strict TypeScript config**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

**Step 3: Add initial types/config skeleton**

```ts
export type SessionKind = "main" | "subagent" | "other";
export interface Snapshot {
  sessionKey: string;
  capturedAt: string;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  contextUsed: number | null;
  contextMax: number | null;
}
```

**Step 4: Add a minimal entrypoint**

```ts
import { loadConfig } from "./config.js";

const config = loadConfig();
console.log("quota-bot bootstrap ok", { dbPath: config.dbPath });
```

**Step 5: Verify TypeScript compiles**

Run: `cd apps/quota-bot && npm install && npm run check`
Expected: exits 0 with no type errors

**Step 6: Commit**

```bash
git add apps/quota-bot
git commit -m "feat: bootstrap quota monitor app"
```

### Task 2: Add SQLite store and schema migration

**Files:**
- Modify: `apps/quota-bot/package.json`
- Create: `apps/quota-bot/src/store.ts`
- Create: `apps/quota-bot/src/schema.sql`
- Create: `apps/quota-bot/tests/store.test.ts`

**Step 1: Add the database dependency**

```json
{
  "dependencies": {
    "better-sqlite3": "^11.8.1"
  }
}
```

**Step 2: Write the schema**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  session_key TEXT PRIMARY KEY,
  label TEXT,
  kind TEXT NOT NULL,
  owner TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  context_used INTEGER,
  context_max INTEGER,
  five_hour_left_pct REAL,
  five_hour_reset_in_sec INTEGER,
  week_left_pct REAL,
  week_reset_in_sec INTEGER,
  thinking TEXT,
  raw_status_text TEXT
);

CREATE TABLE IF NOT EXISTS usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT NOT NULL,
  from_snapshot_id INTEGER,
  to_snapshot_id INTEGER NOT NULL,
  delta_tokens_in INTEGER,
  delta_tokens_out INTEGER,
  delta_context INTEGER,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  pushed_at TEXT,
  push_status TEXT
);
```

**Step 3: Implement store helpers**

```ts
export interface Store {
  upsertSession(...args: unknown[]): void;
  insertSnapshot(...args: unknown[]): number;
  listActiveSessions(): unknown[];
}
```

**Step 4: Write a failing test for schema bootstrap**

```ts
import test from "node:test";
import assert from "node:assert/strict";

test("initializes tables", () => {
  assert.equal(true, false);
});
```

**Step 5: Implement the minimal store to pass the test**

Run: `cd apps/quota-bot && npm test`
Expected: initial FAIL, then PASS after implementation

**Step 6: Commit**

```bash
git add apps/quota-bot/package.json apps/quota-bot/src/store.ts apps/quota-bot/src/schema.sql apps/quota-bot/tests/store.test.ts
git commit -m "feat: add quota bot sqlite store"
```

### Task 3: Implement session discovery

**Files:**
- Create: `apps/quota-bot/src/session-discovery.ts`
- Create: `apps/quota-bot/tests/session-discovery.test.ts`
- Modify: `apps/quota-bot/src/types.ts`

**Step 1: Define the discovery contract**

```ts
export interface DiscoveredSession {
  sessionKey: string;
  label: string;
  kind: "main" | "subagent" | "other";
  updatedAt: string | null;
}
```

**Step 2: Write a failing classifier test**

```ts
test("classifies main and subagent sessions", () => {
  const rows = [
    { sessionKey: "agent:main:telegram:direct:1" },
    { sessionKey: "subagent:abc" }
  ];
  // expect classifier output here
});
```

**Step 3: Implement minimal discovery/classification logic**

```ts
export function classifySession(sessionKey: string): SessionKind {
  if (sessionKey.includes("agent:main:")) return "main";
  if (sessionKey.includes("subagent")) return "subagent";
  return "other";
}
```

**Step 4: Add an adapter boundary for live session listing**

```ts
export interface SessionLister {
  list(): Promise<DiscoveredSession[]>;
}
```

**Step 5: Run tests**

Run: `cd apps/quota-bot && npm test -- --test-name-pattern="classifies main and subagent sessions"`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/quota-bot/src/session-discovery.ts apps/quota-bot/src/types.ts apps/quota-bot/tests/session-discovery.test.ts
git commit -m "feat: add session discovery layer"
```

### Task 4: Implement status parsing and snapshot collection

**Files:**
- Create: `apps/quota-bot/src/collector.ts`
- Create: `apps/quota-bot/tests/collector.test.ts`
- Modify: `apps/quota-bot/src/types.ts`

**Step 1: Write a failing parser test using a real-looking status block**

```ts
const raw = `🧠 Model: openai-codex/gpt-5.4\n🧮 Tokens: 859 in / 917 out\n📚 Context: 20k/272k (7%)\n📊 Usage: 5h 99% left ⏱4h 52m · Week 93% left ⏱4d 15h\n⚙️ Runtime: direct · Think: off · elevated`;
```

Assert that the parser returns:
- model = `openai-codex/gpt-5.4`
- tokensIn = `859`
- tokensOut = `917`
- contextUsed ≈ `20000`
- contextMax ≈ `272000`
- thinking = `off`
- weekLeftPct = `93`

**Step 2: Implement a pure parser first**

```ts
export function parseStatus(raw: string): ParsedStatus {
  // regex-based extraction with null-safe fallbacks
}
```

**Step 3: Add a collector boundary**

```ts
export interface StatusFetcher {
  fetch(sessionKey: string): Promise<string>;
}
```

**Step 4: Implement collection orchestration**

```ts
export async function collectOne(fetcher: StatusFetcher, sessionKey: string): Promise<Snapshot> {
  const raw = await fetcher.fetch(sessionKey);
  return parseStatus(raw);
}
```

**Step 5: Run tests**

Run: `cd apps/quota-bot && npm test -- --test-name-pattern="parser"`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/quota-bot/src/collector.ts apps/quota-bot/src/types.ts apps/quota-bot/tests/collector.test.ts
git commit -m "feat: add status collector and parser"
```

### Task 5: Compute snapshot deltas and event generation

**Files:**
- Create: `apps/quota-bot/src/diff.ts`
- Create: `apps/quota-bot/tests/diff.test.ts`
- Modify: `apps/quota-bot/src/types.ts`

**Step 1: Write a failing delta test**

```ts
test("computes positive token delta", () => {
  const before = { tokensIn: 100, tokensOut: 20, contextUsed: 1000 };
  const after = { tokensIn: 140, tokensOut: 55, contextUsed: 1300 };
  // expect +40 / +35 / +300
});
```

**Step 2: Implement the normal delta path**

```ts
export function diffSnapshots(before: Snapshot | null, after: Snapshot): UsageEvent | null {
  if (!before) return null;
  if ((after.tokensIn ?? 0) < (before.tokensIn ?? 0)) return { eventType: "reset_or_rollover", ... };
  return {
    eventType: "normal",
    deltaTokensIn: (after.tokensIn ?? 0) - (before.tokensIn ?? 0),
    deltaTokensOut: (after.tokensOut ?? 0) - (before.tokensOut ?? 0),
    deltaContext: (after.contextUsed ?? 0) - (before.contextUsed ?? 0)
  };
}
```

**Step 3: Add warning rules tests**

Test threshold transitions for:
- low 5h quota
- low week quota
- high context

**Step 4: Implement warning event helpers**

Run: `cd apps/quota-bot && npm test -- --test-name-pattern="delta|quota|context"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/quota-bot/src/diff.ts apps/quota-bot/src/types.ts apps/quota-bot/tests/diff.test.ts
git commit -m "feat: add snapshot diff and warning rules"
```

### Task 6: Build formatting and query commands

**Files:**
- Create: `apps/quota-bot/src/format.ts`
- Create: `apps/quota-bot/src/commands.ts`
- Create: `apps/quota-bot/tests/commands.test.ts`

**Step 1: Write a failing test for `总览` output**

```ts
test("formats overview summary", () => {
  const text = formatOverview({ activeCount: 2, fiveHourLeftPct: 91, weekLeftPct: 84 });
  assert.match(text, /活跃会话：2/);
  assert.match(text, /5h 剩余：91%/);
});
```

**Step 2: Implement formatters**

```ts
export function formatOverview(input: OverviewView): string {
  return [
    `活跃会话：${input.activeCount}`,
    `5h 剩余：${input.fiveHourLeftPct ?? "暂无数据"}%`,
    `Week 剩余：${input.weekLeftPct ?? "暂无数据"}%`
  ].join("\n");
}
```

**Step 3: Implement command routing**

Support:
- `总览`
- `会话列表`
- `查看 <会话>`
- `最近消耗`
- `订阅状态`
- `开启推送`
- `关闭推送`

**Step 4: Run tests**

Run: `cd apps/quota-bot && npm test -- --test-name-pattern="overview|command"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/quota-bot/src/format.ts apps/quota-bot/src/commands.ts apps/quota-bot/tests/commands.test.ts
git commit -m "feat: add quota bot query commands"
```

### Task 7: Add scheduler and push throttling

**Files:**
- Create: `apps/quota-bot/src/scheduler.ts`
- Create: `apps/quota-bot/src/pusher.ts`
- Create: `apps/quota-bot/tests/pusher.test.ts`
- Modify: `apps/quota-bot/src/config.ts`

**Step 1: Write a failing throttle test**

```ts
test("merges normal events inside throttle window", () => {
  // create two events within five minutes
  // expect one merged push batch
});
```

**Step 2: Implement push policy**

```ts
export interface PushPolicy {
  normalMergeWindowMs: number;
  fiveHourThresholds: number[];
  weekThresholds: number[];
  contextThresholds: number[];
}
```

**Step 3: Implement scheduler loop**

```ts
setInterval(async () => {
  await runCollectionCycle();
}, config.pollIntervalMs);
```

**Step 4: Mark events as pushed safely**

Run: `cd apps/quota-bot && npm test -- --test-name-pattern="throttle|push"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/quota-bot/src/scheduler.ts apps/quota-bot/src/pusher.ts apps/quota-bot/src/config.ts apps/quota-bot/tests/pusher.test.ts
git commit -m "feat: add quota push scheduler"
```

### Task 8: Wire the transport adapter and end-to-end dry run

**Files:**
- Modify: `apps/quota-bot/src/index.ts`
- Create: `apps/quota-bot/src/openclaw-adapter.ts`
- Create: `apps/quota-bot/tests/e2e-dryrun.test.ts`
- Modify: `apps/quota-bot/README.md`

**Step 1: Create an adapter boundary for live OpenClaw session/status access**

```ts
export interface OpenClawAdapter {
  listSessions(): Promise<DiscoveredSession[]>;
  fetchStatus(sessionKey: string): Promise<string>;
  sendMessage(text: string): Promise<void>;
}
```

**Step 2: Write a dry-run test with fake adapter input**

Test this full flow:
- discover sessions
- collect snapshot
- write snapshot
- compute delta
- format overview

**Step 3: Implement startup wiring**

```ts
async function main() {
  const adapter = createOpenClawAdapter();
  await runStartupHealthcheck(adapter);
  await runCollectionCycle();
}
```

**Step 4: Run the full check**

Run:
- `cd apps/quota-bot && npm run check`
- `cd apps/quota-bot && npm test`

Expected: all green

**Step 5: Document local operation**

Add README sections for:
- install
- configure db path and poll interval
- run in manual mode
- run scheduler mode
- troubleshooting missing quota fields

**Step 6: Commit**

```bash
git add apps/quota-bot/src/index.ts apps/quota-bot/src/openclaw-adapter.ts apps/quota-bot/tests/e2e-dryrun.test.ts apps/quota-bot/README.md
git commit -m "feat: wire quota bot end to end"
```

### Task 9: Add retention and operational safety

**Files:**
- Modify: `apps/quota-bot/src/store.ts`
- Modify: `apps/quota-bot/src/config.ts`
- Create: `apps/quota-bot/tests/retention.test.ts`
- Modify: `apps/quota-bot/README.md`

**Step 1: Write a failing retention test**

```ts
test("prunes old snapshots beyond retention window", () => {
  // seed old rows
  // run prune
  // expect recent rows kept, old rows deleted
});
```

**Step 2: Implement retention config**

```ts
export interface AppConfig {
  retentionDays: number;
}
```

**Step 3: Implement prune routine**

Run: `cd apps/quota-bot && npm test -- --test-name-pattern="retention"`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/quota-bot/src/store.ts apps/quota-bot/src/config.ts apps/quota-bot/tests/retention.test.ts apps/quota-bot/README.md
git commit -m "chore: add quota bot retention policy"
```

### Task 10: Final validation and handoff

**Files:**
- Modify: `docs/plans/2026-03-20-quota-monitor-bot-design.md`
- Modify: `apps/quota-bot/README.md`
- Create: `apps/quota-bot/docs/ops-checklist.md`

**Step 1: Run the final validation suite**

Run:
- `cd apps/quota-bot && npm run check`
- `cd apps/quota-bot && npm test`

Expected: all pass

**Step 2: Perform a manual smoke test**

Checklist:
- query `总览`
- query `会话列表`
- query `最近消耗`
- verify one merged push summary
- verify one low-quota or simulated threshold alert

**Step 3: Update docs with any implementation deltas**

**Step 4: Commit**

```bash
git add docs/plans/2026-03-20-quota-monitor-bot-design.md apps/quota-bot/README.md apps/quota-bot/docs/ops-checklist.md
git commit -m "docs: finalize quota bot handoff"
```
