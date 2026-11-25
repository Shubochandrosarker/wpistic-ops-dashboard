import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DeskShell } from "@/components/desk-shell";
import { TimeText } from "@/components/time-text";
import { Button, Notice, Panel, Pill } from "@/components/ui";
import { useDesk } from "@/lib/desk-store";
import { listMdrsFn } from "@/lib/fns";
import { formatPhone } from "@/lib/phone";

type Mdr = {
  id?: string;
  created_at?: string;
  direction?: string;
  cli?: string;
  cld?: string;
  status?: string;
  message_type?: string;
  parts?: number;
  cost?: string;
  currency?: string;
};

export const Route = createFileRoute("/traffic")({
  head: () => ({ meta: [{ title: "Traffic · Line Desk" }] }),
  component: TrafficPage,
});

function TrafficPage() {
  return (
    <DeskShell>
      <Traffic />
    </DeskShell>
  );
}

function Traffic() {
  const apiKey = useDesk((state) => state.apiKey);
  const businessNumber = useDesk((state) => state.businessNumber);
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [records, setRecords] = useState<Mdr[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(next = days) {
    setLoading(true);
    setError("");
    try {
      const result = await listMdrsFn({ data: { apiKey, businessNumber, days: next } });
      setRecords(result.records);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load traffic");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-y-auto px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Traffic</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            SMS and MMS detail records for {formatPhone(businessNumber)}. Telnyx does not put message
            text in this report. Full text stays in the inbox.
          </p>
        </div>
        <div className="flex gap-2">
          {([1, 7, 30] as const).map((value) => (
            <Button
              key={value}
              variant={days === value ? "primary" : "ghost"}
              onClick={() => {
                setDays(value);
                if (apiKey) void load(value);
              }}
            >
              {value === 1 ? "24h" : `${value}d`}
            </Button>
          ))}
        </div>
      </div>
      {!apiKey ? (
        <Notice>
          Connect the API key in{" "}
          <Link to="/settings" className="text-fg underline">
            Settings
          </Link>{" "}
          to pull carrier records.
        </Notice>
      ) : (
        <Button className="self-start" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : records ? "Refresh" : "Load records"}
        </Button>
      )}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <div className="grid gap-3">
        {records?.length === 0 ? <Notice>No SMS or MMS records in this window.</Notice> : null}
        {records?.map((record) => (
          <Panel key={record.id ?? `${record.created_at}-${record.cli}-${record.cld}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Pill tone={record.status === "DELIVERED" || record.status === "RECEIVED" ? "ok" : "warn"}>
                  {record.status || "unknown"}
                </Pill>
                <Pill>{record.message_type || "SMS"}</Pill>
                <Pill>{record.direction || "—"}</Pill>
              </div>
              <span className="text-xs text-faint">
                {record.created_at ? <TimeText iso={record.created_at} /> : "—"}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-faint">From</dt>
                <dd className="font-mono">{record.cli ? formatPhone(record.cli) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-faint">To</dt>
                <dd className="font-mono">{record.cld ? formatPhone(record.cld) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Parts</dt>
                <dd className="tabular-nums">{record.parts ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Cost</dt>
                <dd className="tabular-nums">
                  {record.cost ? `${record.cost} ${record.currency ?? ""}` : "—"}
                </dd>
              </div>
            </dl>
          </Panel>
        ))}
      </div>
    </div>
  );
}
