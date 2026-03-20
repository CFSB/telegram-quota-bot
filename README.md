# Telegram Quota Bot

A Telegram quota monitor bot for OpenClaw sessions.

It tracks session snapshots, recent usage deltas, and rolling 5-hour / weekly usage windows without storing message bodies.

## What it does

- Monitors your own OpenClaw sessions and subagents
- Captures model, token, context, and quota-window snapshots
- Computes recent usage deltas from snapshot changes
- Sends Telegram push notifications for important quota/context events
- Exposes a lightweight Telegram command interface for overview and inspection
- Keeps a strict metadata-only privacy boundary

## Why it exists

When you are actively using OpenClaw across a main session and subagents, it is easy to lose track of:

- which session is getting heavy
- how much recent usage changed
- how much 5-hour or weekly quota remains

This project provides a simple Telegram-first workflow for checking that information without opening internal tooling every time.

## Current scope and limitations

This repository is intentionally narrow in scope.

- **OpenClaw-first**: it currently depends on local OpenClaw CLI / Gateway session surfaces
- **Telegram-first**: Telegram private chat is the primary interaction surface
- **Local / self-hosted**: the current workflow is designed for personal or small-scale self-hosted use
- **Metadata-only**: it stores session metadata only — not message bodies
- **Not a SaaS product**: this is a practical local monitoring bot, not a hosted multi-tenant dashboard

## Features

- Telegram commands:
  - `/start`
  - `/help`
  - `总览`
  - `会话列表`
  - `查看 <session>`
  - `最近消耗`
  - `订阅状态`
  - `开启推送` / `关闭推送`
- Telegram command menu + persistent reply keyboard
- Rolling 5-hour and weekly usage window summaries
- Context threshold warnings
- Recent usage summaries with last sync time
- Heaviest-session hint in overview
- Local SQLite storage with retention pruning

## Repository layout

```text
apps/quota-bot/                 Main app
apps/quota-bot/src/             Runtime source code
apps/quota-bot/tests/           Test suite
apps/quota-bot/docs/            Operations notes
apps/quota-bot/.env.example     Example runtime configuration
docs/plans/                     Design and implementation planning docs
```

## Quick start

### 1. Install dependencies

```bash
cd apps/quota-bot
npm install
```

### 2. Configure environment variables

Create your local environment file or export variables directly.

Minimum Telegram settings:

```bash
export QUOTA_BOT_TELEGRAM_BOT_TOKEN="<your-bot-token>"
export QUOTA_BOT_TELEGRAM_CHAT_ID="<your-chat-id>"
```

Optional runtime settings:

```bash
export QUOTA_BOT_DB_PATH=./data/quota-bot.sqlite
export QUOTA_BOT_POLL_INTERVAL_MS=60000
export QUOTA_BOT_RETENTION_DAYS=30
export QUOTA_BOT_PUSH_ENABLED=true
export QUOTA_BOT_NORMAL_MERGE_WINDOW_MS=300000
export QUOTA_BOT_FIVE_HOUR_THRESHOLDS=30,15,5
export QUOTA_BOT_WEEK_THRESHOLDS=20,10
export QUOTA_BOT_CONTEXT_THRESHOLDS=85,95
```

### 3. Start the bot

```bash
npm start
```

When Telegram token and chat id are configured, the bot starts:

- periodic collection
- push notifications
- Telegram command polling

## Telegram commands

### Slash commands

- `/start` — show welcome + current status summary
- `/help` — show command help
- `/overview` — same as `总览`
- `/sessions` — same as `会话列表`
- `/usage` — same as `最近消耗`
- `/subscription` — same as `订阅状态`
- `/push_on` — same as `开启推送`
- `/push_off` — same as `关闭推送`
- `/view <session>` — same as `查看 <session>`

### Text commands

- `总览`
- `总揽`
- `纵览`
- `会话列表`
- `查看 <session>`
- `最近消耗`
- `订阅状态`
- `开启推送`
- `关闭推送`

## How it works

The bot is built around snapshot-based monitoring.

1. It discovers active OpenClaw sessions
2. It captures metadata snapshots for each session
3. It computes deltas between snapshots
4. It stores snapshots and events in SQLite
5. It exposes summaries through Telegram and push notifications

Current OpenClaw integration uses local CLI / Gateway calls such as:

- `openclaw gateway call sessions.list --json`
- `openclaw gateway call usage.status --json`

## Privacy boundary

This project is intentionally metadata-only.

It stores and processes:

- session identifiers
- labels / kinds
- model names
- token counts
- context usage
- quota window percentages
- timestamps

It does **not** store or process message bodies.

## Development

### Run checks

```bash
npm run check
npm test
npm run build
```

### Dry-run with fixture data

```bash
QUOTA_BOT_FIXTURE_PATH=./fixture.json QUOTA_BOT_RUN_ONCE=1 npm start
```

### Real Telegram push smoke test

```bash
QUOTA_BOT_TELEGRAM_BOT_TOKEN="<your-bot-token>" \
QUOTA_BOT_TELEGRAM_CHAT_ID="<your-chat-id>" \
QUOTA_BOT_RUN_ONCE=1 \
npm start
```

## Roadmap

Near-term improvements could include:

- better public-facing docs and examples
- more polished recent-usage summaries
- additional command aliases and filters
- optional richer session grouping and reporting
- cleaner separation between internal workspace and public repo packaging

## Notes

- If you are publishing or forking this project, do **not** commit real bot tokens or chat ids
- Use `apps/quota-bot/.env.example` as your reference instead of committing secrets
- This public repository is the sanitized export version of the project
