import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { DeskShell } from "@/components/desk-shell";
import { Button, Notice, Panel, Pill } from "@/components/ui";
import { useDesk } from "@/lib/desk-store";
import { loadSnapshotFn } from "@/lib/fns";
import type { DeskSnapshot } from "@/lib/telnyx.server";
import { formatPhone, samePhone } from "@/lib/phone";

export const Route = createFileRoute("/number")({
  head: () => ({ meta: [{ title: "Line · Line Desk" }] }),
  component: NumberPage,
});

function NumberPage() {
  return (
    <DeskShell>
      <NumberView />
    </DeskShell>
  );
}

function NumberView() {
  const apiKey = useDesk((state) => state.apiKey);
  const businessNumber = useDesk((state) => state.businessNumber);
  const publicKey = useDesk((state) => state.publicKey);
  const setProfileId = useDesk((state) => state.setProfileId);
  const [snapshot, setSnapshot] = useState<DeskSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await loadSnapshotFn({ data: { apiKey, businessNumber } });
      setSnapshot(result);
      if (result.profile?.id) setProfileId(result.profile.id);
      else if (result.number?.messaging_profile_id) setProfileId(result.number.messaging_profile_id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not read the line");
    } finally {
      setLoading(false);
    }
  }

  const wa = snapshot?.whatsappNumbers.find((item) => item.phone_number && samePhone(item.phone_number, businessNumber));
  const checks = snapshot
    ? [
        { label: "Number on the Telnyx account", ok: Boolean(snapshot.number) },
        { label: "Messaging profile attached", ok: Boolean(snapshot.number?.messaging_profile_id || snapshot.profile) },
        { label: "Domestic two-way SMS", ok: Boolean(snapshot.number?.features?.sms?.domestic_two_way) },
        {
          label: "10DLC campaign assigned",
          ok: snapshot.campaign?.assignmentStatus === "ASSIGNED",
        },
        { label: "WhatsApp number present", ok: Boolean(wa) },
        { label: "Webhook public key saved", ok: Boolean(publicKey) },
      ]
    : [];

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto px-4 py-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Line</h1>
        <p className="mt-1 font-mono text-sm text-muted">{formatPhone(businessNumber)}</p>
      </div>
      {!apiKey ? (
        <Notice>
          Add the API key in{" "}
          <Link to="/settings" className="text-fg underline">
            Settings
          </Link>{" "}
          to read live status.
        </Notice>
      ) : (
        <Button className="self-start" onClick={() => void load()} disabled={loading}>
          {loading ? "Checking…" : "Check line"}
        </Button>
      )}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {snapshot ? (
        <>
          <Panel title="Readiness">
            <ul className="grid gap-2">
              {checks.map((check) => (
                <li key={check.label} className="flex items-center justify-between gap-3 text-sm">
                  <span>{check.label}</span>
                  <Pill tone={check.ok ? "ok" : "warn"}>{check.ok ? "Ready" : "Needs work"}</Pill>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Messaging">
            {snapshot.number ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Fact label="Type" value={snapshot.number.type || "—"} />
                <Fact label="Country" value={snapshot.number.country_code || "—"} />
                <Fact label="Product" value={snapshot.number.messaging_product || "—"} />
                <Fact label="Traffic" value={snapshot.number.traffic_type || "—"} />
                <Fact
                  label="Delivery ratio"
                  value={ratio(snapshot.number.health?.success_ratio)}
                />
                <Fact label="Spam ratio" value={ratio(snapshot.number.health?.spam_ratio)} />
              </dl>
            ) : (
              <p className="text-sm text-muted">
                {snapshot.numberError || "This number was not found on the API key’s account."}
              </p>
            )}
          </Panel>
          <Panel title="Profile and 10DLC">
            <dl className="grid gap-3 text-sm">
              <Fact label="Profile" value={snapshot.profile ? `${snapshot.profile.name}` : "Not attached"} />
              <Fact label="Profile id" value={snapshot.profile?.id || snapshot.number?.messaging_profile_id || "—"} mono />
              <Fact label="Webhook" value={snapshot.profile?.webhook_url || "Not set"} />
              <Fact label="10DLC status" value={snapshot.campaign?.assignmentStatus || snapshot.campaignError || "Not assigned"} />
              <Fact label="Campaign" value={snapshot.campaign?.tcrCampaignId || snapshot.campaign?.campaignId || "—"} mono />
            </dl>
            {snapshot.campaign?.failureReasons ? (
              <p className="mt-3 text-sm text-danger">{snapshot.campaign.failureReasons}</p>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-faint">
              US A2P SMS to local numbers fails without a registered 10DLC brand and campaign. That
              registration stays in the Telnyx portal.
            </p>
          </Panel>
          <Panel title="WhatsApp">
            {snapshot.whatsappError ? <Notice tone="bad">{snapshot.whatsappError}</Notice> : null}
            {wa ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Fact label="Display name" value={wa.display_name || "—"} />
                <Fact label="Status" value={wa.status || "—"} />
                <Fact label="Quality" value={wa.quality_rating || "—"} />
                <Fact label="Phone id" value={wa.phone_number_id || "—"} mono />
              </dl>
            ) : (
              <p className="text-sm text-muted">
                This number is not on a WhatsApp Business account yet. In the Telnyx portal open
                Messaging, then WhatsApp, and connect the account with Embedded Signup. Keep the
                number if it is already in the WhatsApp Business app by using coexistence instead of
                removing it.
              </p>
            )}
            {snapshot.wabas.length ? (
              <ul className="mt-4 grid gap-2">
                {snapshot.wabas.map((waba) => (
                  <li key={waba.waba_id || waba.id} className="text-sm text-muted">
                    {waba.name || waba.waba_id || "WABA"} · {waba.status || "status unknown"} ·{" "}
                    {waba.business_verification_status || "verification unknown"}
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
          <Panel title="Balance">
            {snapshot.balance ? (
              <p className="text-sm tabular-nums">
                {snapshot.balance.balance} {snapshot.balance.currency}
                {snapshot.balance.available ? ` · available credit ${snapshot.balance.available}` : ""}
              </p>
            ) : (
              <p className="text-sm text-muted">{snapshot.balanceError || "Balance hidden for this key."}</p>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className={`break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function ratio(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}
