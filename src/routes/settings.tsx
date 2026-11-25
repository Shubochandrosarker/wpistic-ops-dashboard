import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DeskShell } from "@/components/desk-shell";
import { Button, Field, Notice, Panel, TextArea, TextInput } from "@/components/ui";
import { useDesk } from "@/lib/desk-store";
import { loadSnapshotFn, writeWebhookFn } from "@/lib/fns";
import { formatPhone, toE164 } from "@/lib/phone";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Line Desk" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <DeskShell>
      <Settings />
    </DeskShell>
  );
}

function Settings() {
  const apiKey = useDesk((state) => state.apiKey);
  const publicKey = useDesk((state) => state.publicKey);
  const businessNumber = useDesk((state) => state.businessNumber);
  const businessLabel = useDesk((state) => state.businessLabel);
  const profileId = useDesk((state) => state.profileId);
  const deskToken = useDesk((state) => state.deskToken);
  const quickReplies = useDesk((state) => state.quickReplies);
  const setApiKey = useDesk((state) => state.setApiKey);
  const setPublicKey = useDesk((state) => state.setPublicKey);
  const setBusinessNumber = useDesk((state) => state.setBusinessNumber);
  const setBusinessLabel = useDesk((state) => state.setBusinessLabel);
  const setProfileId = useDesk((state) => state.setProfileId);
  const setQuickReplies = useDesk((state) => state.setQuickReplies);
  const hydrated = useDesk((state) => state.hydrated);
  const clearMessages = useDesk((state) => state.clearMessages);
  const disconnect = useDesk((state) => state.disconnect);

  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [publicDraft, setPublicDraft] = useState(publicKey);
  const [numberDraft, setNumberDraft] = useState(businessNumber);
  const [labelDraft, setLabelDraft] = useState(businessLabel);
  const [profileDraft, setProfileDraft] = useState(profileId);
  const [repliesDraft, setRepliesDraft] = useState(quickReplies.join("\n"));
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    setKeyDraft(apiKey);
    setPublicDraft(publicKey);
    setNumberDraft(businessNumber);
    setLabelDraft(businessLabel);
    setProfileDraft(profileId);
    setRepliesDraft(quickReplies.join("\n"));
  }, [hydrated, apiKey, publicKey, businessNumber, businessLabel, profileId, quickReplies]);

  const webhook =
    typeof window !== "undefined" && deskToken
      ? `${window.location.origin}/api/telnyx/webhook?desk=${deskToken}`
      : "";

  function saveLocal() {
    const number = toE164(numberDraft);
    if (!number) {
      setError("Business number must look like +15055201914.");
      return;
    }
    setError("");
    setApiKey(keyDraft);
    setPublicKey(publicDraft);
    setBusinessNumber(number);
    setNumberDraft(number);
    setBusinessLabel(labelDraft.trim() || "WordPressistic");
    setProfileId(profileDraft);
    setQuickReplies(
      repliesDraft
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8),
    );
    setStatus("Saved on this device. The API key is not stored on the server.");
  }

  async function testConnection() {
    saveLocal();
    const number = toE164(numberDraft);
    const key = keyDraft.trim();
    if (!number) return;
    if (key.length < 12) {
      setError("Enter the Telnyx API key first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const snapshot = await loadSnapshotFn({ data: { apiKey: key, businessNumber: number } });
      if (snapshot.profile?.id) setProfileId(snapshot.profile.id);
      else if (snapshot.number?.messaging_profile_id) setProfileId(snapshot.number.messaging_profile_id);
      const bits = [
        snapshot.number ? `Number found (${snapshot.number.type || "line"}).` : "Key works, but this number is not on the account.",
        snapshot.profile ? `Profile: ${snapshot.profile.name}.` : "No messaging profile on the number.",
        snapshot.whatsappNumbers.some((item) => item.phone_number && item.phone_number.replace(/\D/g, "").endsWith(number.replace(/\D/g, "")))
          ? "WhatsApp number is connected."
          : "WhatsApp is not connected for this number yet.",
        snapshot.campaign?.assignmentStatus
          ? `10DLC: ${snapshot.campaign.assignmentStatus}.`
          : "No 10DLC assignment found.",
      ];
      setStatus(bits.join(" "));
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Connection test failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyWebhook() {
    if (!webhook) return;
    setBusy(true);
    setError("");
    try {
      const result = await writeWebhookFn({
        data: {
          apiKey: keyDraft.trim() || apiKey,
          profileId: profileDraft.trim() || profileId,
          webhookUrl: webhook,
          token: deskToken,
        },
      });
      setStatus(`Webhook saved on the messaging profile: ${result.webhook_url || webhook}`);
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : "Could not update the profile");
    } finally {
      setBusy(false);
    }
  }

  async function copyWebhook() {
    if (!webhook) return;
    try {
      await navigator.clipboard.writeText(webhook);
      setStatus("Webhook URL copied.");
    } catch {
      setError("Copy failed. Select the URL and copy it manually.");
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto px-4 py-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Keys stay in this browser. Each send and lookup passes the key to Telnyx and does not keep
          it on the server. Hosting mail and AnyChat live on the shared team desk instead.
        </p>
        <p className="mt-3 text-sm text-muted">
          <Link to="/number" className="text-fg underline">Line</Link>
          <span className="text-faint"> · </span>
          <Link to="/traffic" className="text-fg underline">Traffic</Link>
          <span className="text-faint"> · </span>
          <Link to="/templates" className="text-fg underline">Templates</Link>
        </p>
      </div>
      {status ? <Notice>{status}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}

      <Panel title="Telnyx API key">
        <div className="grid gap-4">
          <Field
            label="API key"
            hint="Portal → Developer Center → API Keys. Use a key that can send messages and read numbers."
          >
            <div className="flex gap-2">
              <TextInput
                type={showKey ? "text" : "password"}
                value={keyDraft}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder="KEY…"
              />
              <Button type="button" variant="ghost" onClick={() => setShowKey((value) => !value)}>
                {showKey ? "Hide" : "Show"}
              </Button>
            </div>
          </Field>
          <Field
            label="Webhook public key"
            hint="Portal → Account → Public key. Used to verify inbound events. Optional until you publish the webhook."
          >
            <TextArea
              value={publicDraft}
              onChange={(event) => setPublicDraft(event.target.value)}
              spellCheck={false}
              className="min-h-24 font-mono text-xs"
              placeholder="Base64 Ed25519 public key"
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Business line">
        <div className="grid gap-4">
          <Field label="Label">
            <TextInput value={labelDraft} onChange={(event) => setLabelDraft(event.target.value)} />
          </Field>
          <Field label="Number" hint={`Shown as ${formatPhone(numberDraft || businessNumber)}.`}>
            <TextInput
              value={numberDraft}
              onChange={(event) => setNumberDraft(event.target.value)}
              className="font-mono"
            />
          </Field>
          <Field
            label="Messaging profile id"
            hint="Leave blank to use the profile already on the number. Filled in after a successful test."
          >
            <TextInput
              value={profileDraft}
              onChange={(event) => setProfileDraft(event.target.value)}
              className="font-mono text-sm"
              placeholder="UUID"
            />
          </Field>
          <Field label="Quick replies" hint="One reply per line. They stay on this device.">
            <TextArea value={repliesDraft} onChange={(event) => setRepliesDraft(event.target.value)} />
          </Field>
        </div>
      </Panel>

      <Panel title="Inbound webhook">
        <p className="text-sm leading-6 text-muted">
          Telnyx does not offer a history feed that includes message text. Point the messaging
          profile webhook here so SMS and WhatsApp replies land in the inbox. Delivery is reliable
          after you publish this desk; the preview address is only reachable while this session is
          open.
        </p>
        <p className="mt-3 break-all rounded-md border border-line bg-bg px-3 py-3 font-mono text-xs leading-5">
          {webhook || "Opening…"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => void copyWebhook()}>
            Copy URL
          </Button>
          <Button type="button" variant="ghost" onClick={() => void applyWebhook()} disabled={busy}>
            Write to profile
          </Button>
        </div>
      </Panel>

      <Panel title="What still happens in the Telnyx portal">
        <ul className="grid list-disc gap-2 pl-5 text-sm leading-6 text-muted">
          <li>Create the API key and copy the account public key.</li>
          <li>Put +1 505 520 1914 on a messaging profile with SMS enabled.</li>
          <li>Register 10DLC brand and campaign, then assign this number, or US texts will fail.</li>
          <li>
            Connect WhatsApp with Embedded Signup under Messaging → WhatsApp. If the number is
            already in the WhatsApp Business app, use coexistence instead of deleting it from the
            phone.
          </li>
          <li>Submit message templates and wait for Meta approval before cold outreach.</li>
        </ul>
        <p className="mt-4 text-sm">
          <a className="text-fg underline" href="https://portal.telnyx.com" target="_blank" rel="noreferrer">
            Open Telnyx portal
          </a>
          <span className="text-faint"> · </span>
          <a
            className="text-fg underline"
            href="https://developers.telnyx.com/docs/messaging/whatsapp/quickstart"
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp setup guide
          </a>
        </p>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={saveLocal}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => void testConnection()} disabled={busy}>
          {busy ? "Working…" : "Save and test"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => clearMessages()}>
          Clear local inbox
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            disconnect();
            setKeyDraft("");
            setPublicDraft("");
            setProfileDraft("");
            setStatus("API key removed from this browser.");
          }}
        >
          Remove keys
        </Button>
      </div>
    </div>
  );
}
