import type { Snapshot } from "./types.js";

export interface ParsedStatus {
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  contextUsed: number | null;
  contextMax: number | null;
  fiveHourLeftPct: number | null;
  fiveHourResetInSec: number | null;
  weekLeftPct: number | null;
  weekResetInSec: number | null;
  thinking: string | null;
  rawStatusText: string;
}

export interface StatusFetcher {
  fetch(sessionKey: string): Promise<string>;
}

export function parseStatus(raw: string): ParsedStatus {
  const model = raw.match(/🧠\s*Model:\s*(.+)/)?.[1]?.trim() ?? null;
  const tokenMatch = raw.match(/🧮\s*Tokens:\s*([\d,]+)\s*in\s*\/\s*([\d,]+)\s*out/i);
  const contextMatch = raw.match(/📚\s*Context:\s*([\d.]+)([kKmM]?)\s*\/\s*([\d.]+)([kKmM]?)/);
  const fiveHourLeftPct = parsePercent(raw, /5h\s+(\d+)%\s+left/i);
  const weekLeftPct = parsePercent(raw, /Week\s+(\d+)%\s+left/i);
  const thinking = raw.match(/Think:\s*([^\s·]+)/)?.[1]?.trim() ?? null;

  const tokenIn = tokenMatch?.[1];
  const tokenOut = tokenMatch?.[2];
  const contextUsedValue = contextMatch?.[1];
  const contextUsedUnit = contextMatch?.[2];
  const contextMaxValue = contextMatch?.[3];
  const contextMaxUnit = contextMatch?.[4];

  return {
    model,
    tokensIn: tokenIn ? parseInt(tokenIn.replaceAll(",", ""), 10) : null,
    tokensOut: tokenOut ? parseInt(tokenOut.replaceAll(",", ""), 10) : null,
    contextUsed: contextUsedValue && contextUsedUnit !== undefined ? parseCompactNumber(contextUsedValue, contextUsedUnit) : null,
    contextMax: contextMaxValue && contextMaxUnit !== undefined ? parseCompactNumber(contextMaxValue, contextMaxUnit) : null,
    fiveHourLeftPct,
    fiveHourResetInSec: parseResetInSeconds(raw, /5h\s+\d+%\s+left\s+⏱([^·\n]+)/i),
    weekLeftPct,
    weekResetInSec: parseResetInSeconds(raw, /Week\s+\d+%\s+left\s+⏱([^·\n]+)/i),
    thinking,
    rawStatusText: raw
  };
}

export async function collectOne(fetcher: StatusFetcher, sessionKey: string): Promise<Snapshot> {
  const raw = await fetcher.fetch(sessionKey);
  const parsed = parseStatus(raw);

  return {
    sessionKey,
    capturedAt: new Date().toISOString(),
    ...parsed
  };
}

function parsePercent(raw: string, pattern: RegExp): number | null {
  const value = raw.match(pattern)?.[1];
  return value ? parseInt(value, 10) : null;
}

function parseCompactNumber(value: string, unit: string): number {
  const base = Number.parseFloat(value);
  if (unit.toLowerCase() === "k") {
    return Math.round(base * 1000);
  }
  if (unit.toLowerCase() === "m") {
    return Math.round(base * 1000_000);
  }
  return Math.round(base);
}

function parseResetInSeconds(raw: string, pattern: RegExp): number | null {
  const chunk = raw.match(pattern)?.[1]?.trim();
  if (!chunk) {
    return null;
  }

  let total = 0;
  for (const match of chunk.matchAll(/(\d+)\s*([dhms])/gi)) {
    const amountText = match[1];
    const unitText = match[2];
    if (!amountText || !unitText) {
      continue;
    }

    const amount = Number.parseInt(amountText, 10);
    const unit = unitText.toLowerCase();
    if (unit === "d") total += amount * 86400;
    if (unit === "h") total += amount * 3600;
    if (unit === "m") total += amount * 60;
    if (unit === "s") total += amount;
  }

  return total > 0 ? total : null;
}
