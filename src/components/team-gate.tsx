import { useEffect, useState, type ReactNode } from "react";
import { Button, Field, Notice, TextInput } from "@/components/ui";
import { createDeskFn, deskStateFn, joinDeskFn } from "@/lib/support-fns";
import type { DeskCard } from "@/lib/support-types";

export function TeamGate({ children }: { children: (desk: DeskCard) => ReactNode }) {
  const [desk, setDesk] = useState<DeskCard | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("WordPressistic");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    void deskStateFn()
      .then((row) => {
        if (!cancel) setDesk(row);
      })
      .catch((loadError: unknown) => {
        if (!cancel) setError(loadError instanceof Error ? loadError.message : "Could not open the desk");
      })
      .finally(() => {
        if (!cancel) setReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function create() {
    setBusy(true);
    setError("");
    try {
      setDesk(await createDeskFn({ data: { name } }));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the desk");
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    setError("");
    try {
      setDesk(await joinDeskFn({ data: { code } }));
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p className="px-4 py-6 text-sm text-muted">Opening the team desk…</p>;
  if (!desk) {
    return (
      <div className="mx-auto grid w-full max-w-lg gap-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">One desk for the team</h1>
          <p className="mt-2 text-sm text-muted">
            Create it once. Teammates sign in and enter the code. Mail passwords and the AnyChat key stay on
            the desk, not in the browser.
          </p>
        </div>
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <Field label="Desk name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Button type="button" onClick={() => void create()} disabled={busy}>
          Create WordPressistic desk
        </Button>
        <Field label="Or join with a team code">
          <TextInput
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="font-mono uppercase"
            placeholder="8 letters"
          />
        </Field>
        <Button type="button" variant="ghost" onClick={() => void join()} disabled={busy || code.length < 6}>
          Join desk
        </Button>
      </div>
    );
  }
  return <>{children(desk)}</>;
}
