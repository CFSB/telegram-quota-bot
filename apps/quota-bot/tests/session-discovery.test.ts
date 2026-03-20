import test from "node:test";
import assert from "node:assert/strict";

import { classifySession, normalizeDiscoveredSession } from "../src/session-discovery.js";

test("classifies main and subagent sessions", () => {
  const rows = [
    { sessionKey: "agent:main:telegram:direct:1" },
    { sessionKey: "subagent:abc" },
    { sessionKey: "agent:main:subagent:abc" },
    { sessionKey: "misc:xyz" }
  ];

  assert.deepEqual(
    rows.map((row) => classifySession(row.sessionKey)),
    ["main", "subagent", "subagent", "other"]
  );
});

test("normalizes discovered sessions", () => {
  const session = normalizeDiscoveredSession({
    sessionKey: "agent:main:telegram:direct:1",
    label: "  Main Session  ",
    updatedAt: null
  });

  assert.deepEqual(session, {
    sessionKey: "agent:main:telegram:direct:1",
    label: "Main Session",
    kind: "main",
    updatedAt: null
  });
});
