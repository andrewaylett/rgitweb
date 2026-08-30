import { formatAbsoluteDate, formatRelativeDate } from "../utils/format.js";

export function RelativeDate({ date }: { readonly date: Date }) {
  return (
    <time dateTime={date.toISOString()} title={formatAbsoluteDate(date)}>
      {formatRelativeDate(date)}
    </time>
  );
}
