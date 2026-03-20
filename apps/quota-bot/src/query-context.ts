import type { AppConfig } from "./config.js";
import type { CommandContext } from "./commands.js";
import { formatTime } from "./format.js";
import { formatSessionRecord, isMeaningfulUsageEvent } from "./session-display.js";
import type { SchedulerDeps } from "./scheduler.js";
import type { SessionSnapshotRow, UsageEventRecord } from "./types.js";

export function createCommandContext(deps: SchedulerDeps, config: AppConfig): CommandContext {
  return {
    async getOverview() {
      const active = deps.store.listActiveSessions();
      const latest = getMostRecentSnapshot(deps, active.map((session) => session.sessionKey));
      const heaviest = getHeaviestSession(deps, active);
      return {
        activeCount: active.length,
        fiveHourLeftPct: latest?.fiveHourLeftPct ?? null,
        weekLeftPct: latest?.weekLeftPct ?? null,
        heaviestSessionLabel: heaviest?.label ?? null,
        heaviestSessionContextPct: heaviest?.contextPct ?? null
      };
    },
    async listSessions() {
      return deps.store.listActiveSessions().map((session) => {
        const snapshot = deps.store.getLatestSnapshot(session.sessionKey);
        return {
          label: formatSessionRecord(session),
          kind: session.kind,
          model: snapshot?.model ?? null,
          contextUsed: snapshot?.contextUsed ?? null,
          contextMax: snapshot?.contextMax ?? null,
          updatedAt: snapshot?.capturedAt ?? session.lastSeenAt
        };
      });
    },
    async getSessionDetail(query: string) {
      const match = resolveSession(deps, query);
      if (!match) {
        return `未找到会话：${query}`;
      }

      const snapshot = deps.store.getLatestSnapshot(match.sessionKey);
      const recent = deps.store
        .listRecentUsageEvents(50)
        .find((event) => event.sessionKey === match.sessionKey && isMeaningfulUsageEvent(event));

      return [
        `会话：${formatSessionRecord(match)}`,
        `类型：${match.kind}`,
        `模型：${snapshot?.model ?? "暂无数据"}`,
        `Tokens：${formatPair(snapshot?.tokensIn ?? null, snapshot?.tokensOut ?? null, "in", "out")}`,
        `Context：${formatPair(snapshot?.contextUsed ?? null, snapshot?.contextMax ?? null, "used", "max")}`,
        `最近增量：${formatDelta(recent)}`,
        `5h 剩余：${formatNullablePct(snapshot?.fiveHourLeftPct ?? null)}`,
        `Week 剩余：${formatNullablePct(snapshot?.weekLeftPct ?? null)}`,
        `更新时间：${snapshot?.capturedAt ? formatTime(snapshot.capturedAt) : match.lastSeenAt}`
      ].join("\n");
    },
    async getRecentUsage() {
      const events = deps.store
        .listRecentUsageEvents(20)
        .filter((event) => event.eventType !== "reset_or_rollover")
        .filter((event) => isMeaningfulUsageEvent(event))
        .slice(0, 10);
      const lastSnapshot = getMostRecentSnapshot(
        deps,
        deps.store.listActiveSessions().map((session) => session.sessionKey)
      );

      if (events.length === 0) {
        return [
          "最近没有新的消耗记录",
          `最近采集：${lastSnapshot?.capturedAt ? formatTime(lastSnapshot.capturedAt) : "暂无数据"}`
        ].join("\n");
      }

      return [
        `最近采集：${lastSnapshot?.capturedAt ? formatTime(lastSnapshot.capturedAt) : "暂无数据"}`,
        ...events.map((event, index) => {
          if (event.eventType === "normal") {
            return `${index + 1}. ${formatSessionDisplay(event.sessionKey)} · +${event.deltaTokensIn ?? 0} in / +${event.deltaTokensOut ?? 0} out / +${event.deltaContext ?? 0} ctx`;
          }

          if (event.eventType === "quota_warning") {
            const label = event.thresholdKind === "fiveHour" ? "5h" : "Week";
            return `${index + 1}. ${formatSessionDisplay(event.sessionKey)} · ${label} 告警 @ ${event.thresholdValue}%`;
          }

          if (event.eventType === "context_warning") {
            return `${index + 1}. ${formatSessionDisplay(event.sessionKey)} · Context 告警 @ ${event.thresholdValue}%`;
          }

          return `${index + 1}. ${formatSessionDisplay(event.sessionKey)} · rollover/reset`;
        })
      ].join("\n");
    },
    async getSubscriptionStatus() {
      return [
        `推送：${deps.pushState.enabled ? "已开启" : "已关闭"}`,
        `普通事件合并窗口：${Math.round(config.pushPolicy.normalMergeWindowMs / 60_000)} 分钟`,
        `5h 阈值：${config.pushPolicy.fiveHourThresholds.join("/")}%`,
        `Week 阈值：${config.pushPolicy.weekThresholds.join("/")}%`,
        `Context 阈值：${config.pushPolicy.contextThresholds.join("/")}%`
      ].join("\n");
    },
    async enablePush() {
      deps.pushState.enabled = true;
      return "已开启推送";
    },
    async disablePush() {
      deps.pushState.enabled = false;
      return "已关闭推送";
    }
  };
}

function resolveSession(deps: SchedulerDeps, query: string) {
  const sessions = deps.store.listActiveSessions();
  const byIndex = Number(query);
  if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= sessions.length) {
    return sessions[byIndex - 1] ?? null;
  }

  const normalized = query.trim().toLowerCase();
  return sessions.find((session) => {
    const label = formatSessionRecord(session).toLowerCase();
    return session.sessionKey.toLowerCase() === normalized || label === normalized || (session.label?.toLowerCase() ?? "") === normalized;
  }) ?? null;
}

function getMostRecentSnapshot(deps: SchedulerDeps, sessionKeys: string[]): SessionSnapshotRow | null {
  let latest: SessionSnapshotRow | null = null;

  for (const sessionKey of sessionKeys) {
    const snapshot = deps.store.getLatestSnapshot(sessionKey);
    if (!snapshot) {
      continue;
    }

    if (!latest || snapshot.capturedAt > latest.capturedAt) {
      latest = snapshot;
    }
  }

  return latest;
}

function getHeaviestSession(
  deps: SchedulerDeps,
  sessions: Array<ReturnType<SchedulerDeps["store"]["listActiveSessions"]>[number]>
): { label: string; contextPct: number } | null {
  let current: { label: string; contextPct: number } | null = null;

  for (const session of sessions) {
    const snapshot = deps.store.getLatestSnapshot(session.sessionKey);
    if (!snapshot?.contextUsed || !snapshot.contextMax) {
      continue;
    }

    const rawPct = Math.round((snapshot.contextUsed / snapshot.contextMax) * 100);
    const pct = rawPct === 0 ? 1 : rawPct;
    if (!current || pct > current.contextPct) {
      current = {
        label: formatSessionRecord(session),
        contextPct: pct
      };
    }
  }

  return current;
}

function formatPair(left: number | null, right: number | null, leftLabel: string, rightLabel: string): string {
  if (left === null || right === null) {
    return "暂无数据";
  }

  return `${left} ${leftLabel} / ${right} ${rightLabel}`;
}

function formatNullablePct(value: number | null): string {
  return value === null ? "暂无数据" : `${value}%`;
}

function formatSessionDisplay(sessionKey: string): string {
  return formatSessionRecord({
    sessionKey,
    label: null,
    kind: sessionKey.includes("subagent") ? "subagent" : "main",
    owner: null,
    firstSeenAt: "",
    lastSeenAt: "",
    isActive: true
  });
}

function formatDelta(event: UsageEventRecord | undefined): string {
  if (!event) {
    return "暂无数据";
  }

  if (event.eventType !== "normal") {
    return event.eventType;
  }

  if (!isMeaningfulUsageEvent(event)) {
    return "暂无数据";
  }

  return `+${event.deltaTokensIn ?? 0} in / +${event.deltaTokensOut ?? 0} out / +${event.deltaContext ?? 0} ctx`;
}
