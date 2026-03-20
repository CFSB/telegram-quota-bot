# Quota Monitor Bot Design

**Date:** 2026-03-20
**Owner:** 万能舔虾
**Status:** Approved for planning

---

## Goal

Build a separate bot that monitors the user's own OpenClaw sessions and subagents, shows per-session usage snapshots, estimates per-conversation deltas from session snapshots, and reports remaining 5-hour and 1-week usage windows without exposing conversation content.

## Scope

### In scope
- Monitor the user's own sessions only, including the main session and user-created subagents
- Show current model, token in/out, context usage, and 5h/week remaining windows
- Store historical snapshots locally and compute deltas between snapshots
- Support manual queries from a dedicated bot chat
- Support automatic push summaries with throttling
- Only collect session metadata; never read or display message bodies

### Out of scope (v1)
- Team-wide monitoring across multiple users
- Billing/currency conversion
- Message-level exact cost attribution
- Web dashboard
- Fine-grained RBAC or multi-tenant access control

## Product shape

The product is a dedicated monitoring bot, expected to live on Telegram first, with two modes:
1. **Manual query** — user asks for overview, session list, recent usage, or one session detail
2. **Automatic push** — bot sends usage summaries and warnings based on fresh snapshot deltas or quota/context thresholds

## Key assumptions

- The first version targets the user's own sessions only
- Session metadata can be discovered through OpenClaw session APIs or equivalent runtime session surfaces
- `session_status` provides the usage and quota fields needed for the current session model/provider path
- The implementation lives in this workspace as a standalone TypeScript/Node app
- Missing quota fields are tolerated and displayed as unavailable rather than treated as hard errors

## Architecture

The design uses four layers.

### 1. Session discovery
Finds the user's sessions and subagents, normalizes labels, classifies them as `main` or `subagent`, and tracks active/inactive state.

### 2. Status collector
Fetches a fresh status snapshot for each target session. A snapshot contains:
- session key
- label / type
- model
- token in/out
- context used/max
- thinking state
- 5h remaining percentage/time
- week remaining percentage/time
- captured time

### 3. Snapshot store + diff engine
Persists snapshots in SQLite, compares the latest snapshot against the prior snapshot for the same session, and emits usage events such as:
- normal usage delta
- quota warning
- high-context warning
- reset/rollover event when counters unexpectedly shrink

### 4. Bot interface + push layer
Handles user commands, formats summaries, and sends push notifications with rate limiting and merge windows.

## Data flow

### Manual query flow
1. User sends a command to the monitoring bot
2. Bot triggers a fresh collection pass
3. Collector updates snapshots in SQLite
4. Diff engine computes any new events
5. Bot returns a formatted answer based on fresh state

### Automatic push flow
1. A background scheduler periodically checks recently active sessions
2. New snapshots are stored
3. Diff engine computes delta events
4. Push layer decides whether to notify immediately, delay, or merge
5. Bot sends one throttled summary

## Why snapshot deltas

The bot needs to answer: "How much did that conversation/use cycle consume?" The most stable v1 definition is:

> per-session delta = current session counters - previous session counters

This is not message-perfect accounting, but it is reliable, simple, and sufficient to show:
- how much new input/output occurred since the last seen state
- how much the context window grew
- whether a session is becoming heavy

## Storage design

SQLite is preferred over JSON because v1 already needs historical storage, reliable querying, and event generation.

### Table: `sessions`
Tracks session identity and lifecycle.

Suggested fields:
- `session_key` (PK)
- `label`
- `kind` (`main` | `subagent` | `other`)
- `owner`
- `first_seen_at`
- `last_seen_at`
- `is_active`

### Table: `snapshots`
Stores raw status captures.

Suggested fields:
- `id`
- `session_key`
- `captured_at`
- `model`
- `tokens_in`
- `tokens_out`
- `context_used`
- `context_max`
- `five_hour_left_pct`
- `five_hour_reset_in_sec`
- `week_left_pct`
- `week_reset_in_sec`
- `thinking`
- `raw_status_text` (optional)

### Table: `usage_events`
Stores computed diffs and push state.

Suggested fields:
- `id`
- `session_key`
- `from_snapshot_id`
- `to_snapshot_id`
- `delta_tokens_in`
- `delta_tokens_out`
- `delta_context`
- `event_type`
- `created_at`
- `pushed_at`
- `push_status`

## Bot commands (v1)

### `总览`
Shows:
- active session count
- main session label
- aggregated token totals
- per-session model summary
- 5h remaining
- week remaining
- warnings for hot sessions (high context / low quota)

### `会话列表`
Shows compact rows for each active session:
- index
- label
- main/subagent
- model
- context used/max
- recent update time

### `查看 <会话>`
Shows one session in detail:
- model
- token in/out
- context used/max
- latest delta in/out/context
- recent update time
- current 5h/week fields

### `最近消耗`
Shows recent usage events, ordered newest first.

### `订阅状态`
Shows whether push is enabled, throttle settings, and warning thresholds.

### `开启推送` / `关闭推送`
Toggles automatic push notifications.

## Push rules

### Push-worthy events
1. **Normal usage event** — a session has grown since the last snapshot
2. **Low 5h quota** — thresholded warnings, e.g. below 30%, 15%, 5%
3. **Low week quota** — thresholded warnings, e.g. below 40%, 20%, 10%
4. **High context** — thresholded warnings, e.g. above 70%, 85%, 95%

### Throttling
- Merge normal events inside a 5-minute window
- Push quota/context alerts immediately
- Keep one push status marker per event so retries are safe

## Privacy boundary

The system only uses metadata:
- session identity
- model
- token counts
- context size
- usage window fields
- timestamps

It must not fetch message bodies for display or storage.

## Implementation notes (2026-03-20)

- v1 代码已按 `apps/quota-bot/` 独立应用落地。
- 已实现 scheduler、push merge/throttle、SQLite retention prune、fixture/noop adapter、端到端 dry-run 测试。
- 当前 OpenClaw transport 仍保留在 adapter boundary 后，通过 `QUOTA_BOT_FIXTURE_PATH` 完成本地联调；这样不扩大范围，同时保留后续真实接入点。
- 事件存储继续严格遵守 metadata-only 边界：仅保存 session key、token/context/quota 差值、阈值类型与时间戳，不保存正文。

## Failure handling

### Session missing or ended
Mark inactive, keep history, skip future active polling.

### Snapshot fetch fails
Log the failure, keep prior state, retry later; do not fail the whole cycle.

### Quota fields unavailable
Store `NULL`, display as `暂无数据`.

### Counter rollback
Treat as reset/rollover; do not produce a negative normal usage event.

## Rollout plan

### Phase 1
- session discovery
- snapshot collection
- SQLite persistence
- delta calculation
- CLI/debug output

### Phase 2
- manual query bot
- overview/session detail/recent usage commands

### Phase 3
- push notifications
- throttle/merge logic
- low quota and high context warnings

### Phase 4
- config hardening
- retention cleanup
- improved observability

## Acceptance criteria

The design is successful when:
- the user can query a dedicated bot and see all of their active sessions
- the bot shows current 5h and week windows when available
- the bot can show recent per-session usage deltas computed from snapshots
- the bot can automatically push one concise summary after activity without spamming
- no conversation body content is fetched or stored

## Open questions for later versions

- whether to expose provider-level monthly or billing views
- whether to add team-wide monitoring with explicit permissions
- whether to add a lightweight web dashboard on top of the same SQLite store
