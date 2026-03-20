export interface OverviewView {
  activeCount: number;
  fiveHourLeftPct: number | null;
  weekLeftPct: number | null;
  heaviestSessionLabel?: string | null;
  heaviestSessionContextPct?: number | null;
}

export interface SessionListItemView {
  label: string;
  kind: string;
  model: string | null;
  contextUsed: number | null;
  contextMax: number | null;
  updatedAt: string | null;
}

export function formatOverview(input: OverviewView): string {
  return [
    `活跃会话：${input.activeCount}`,
    `5h 剩余：${formatPct(input.fiveHourLeftPct)}`,
    `Week 剩余：${formatPct(input.weekLeftPct)}`,
    formatHeaviestSession(input)
  ].filter(Boolean).join("\n");
}

export function formatSessionList(items: SessionListItemView[]): string {
  if (items.length === 0) {
    return "暂无活跃会话";
  }

  const groups: Array<{ title: string; items: SessionListItemView[] }> = [
    { title: "主会话", items: items.filter((item) => item.kind === "main") },
    { title: "子代理", items: items.filter((item) => item.kind === "subagent") },
    { title: "其他会话", items: items.filter((item) => item.kind !== "main" && item.kind !== "subagent") }
  ].filter((group) => group.items.length > 0);

  return groups
    .map((group) => [
      `【${group.title}】`,
      ...group.items.map((item, index) => {
        const context = item.contextUsed !== null && item.contextMax !== null
          ? `${item.contextUsed}/${item.contextMax}`
          : "暂无数据";
        const updatedAt = item.updatedAt ? ` · 更新于 ${formatTime(item.updatedAt)}` : "";
        return `${index + 1}. ${item.label} · ${item.model ?? "未知模型"} · Context ${context}${updatedAt}`;
      })
    ].join("\n"))
    .join("\n\n");
}

export function formatTime(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return input;
  }

  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatPct(value: number | null): string {
  return value === null ? "暂无数据" : `${value}%`;
}

function formatHeaviestSession(input: OverviewView): string | null {
  if (!input.heaviestSessionLabel || input.heaviestSessionContextPct === null || input.heaviestSessionContextPct === undefined) {
    return null;
  }

  return `最重会话：${input.heaviestSessionLabel} · Context ${input.heaviestSessionContextPct}%`;
}
