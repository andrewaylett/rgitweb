export function shortOid(oid: string, length = 7): string {
  return oid.slice(0, length);
}

const UNITS: readonly {
  readonly limit: number;
  readonly divisor: number;
  readonly unit: string;
}[] = [
  { limit: 60, divisor: 1, unit: "second" },
  { limit: 3600, divisor: 60, unit: "minute" },
  { limit: 86_400, divisor: 3600, unit: "hour" },
  { limit: 2_592_000, divisor: 86_400, unit: "day" },
  { limit: 31_536_000, divisor: 2_592_000, unit: "month" },
  { limit: Infinity, divisor: 31_536_000, unit: "year" },
];

/** "3 days ago" / "in 2 hours" style relative formatting. */
export function formatRelativeDate(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const absSeconds = Math.abs(seconds);
  if (absSeconds < 5) {
    return "just now";
  }
  const bucket = UNITS.find((entry) => absSeconds < entry.limit);
  if (bucket === undefined) {
    // Unreachable: the last UNITS entry has limit Infinity, so `find` always
    // matches something once absSeconds is a finite number.
    return seconds >= 0 ? "a long time ago" : "in a long time";
  }
  const value = Math.max(1, Math.round(absSeconds / bucket.divisor));
  const plural = value === 1 ? bucket.unit : `${bucket.unit}s`;
  return seconds >= 0 ? `${value} ${plural} ago` : `in ${value} ${plural}`;
}

export function formatAbsoluteDate(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  });
}

export function summaryLine(message: string): string {
  return message.split("\n", 1)[0] ?? "";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
