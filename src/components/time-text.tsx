export function TimeText({ iso }: { iso: string }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <span>{iso}</span>;
  return (
    <time dateTime={iso} className="tabular-nums" suppressHydrationWarning>
      {date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </time>
  );
}
