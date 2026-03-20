import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createStore } from "../src/store.js";

test("initializes tables", () => {
  const dir = mkdtempSync(join(tmpdir(), "quota-bot-store-"));
  const store = createStore({ dbPath: join(dir, "quota-bot.sqlite") });

  const tables = store
    .getDatabase()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row: unknown) => (row as { name: string }).name);

  assert.deepEqual(tables, ["sessions", "snapshots", "sqlite_sequence", "usage_events"]);
});
