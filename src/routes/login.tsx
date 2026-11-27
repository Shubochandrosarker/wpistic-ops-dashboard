import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";

/** Broker buttons need the shared auth broker; standalone deploys hide them. */
const brokerEnabled = import.meta.env.VITE_GROK_BROKER !== "0";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · Line Desk" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const result =
        mode === "signin"
          ? await authClient.signIn.email({ email: email.trim(), password })
          : await authClient.signUp.email({
              email: email.trim(),
              password,
              name: name.trim() || email.split("@")[0],
            });
      if (result.error) {
        setError(result.error.message || "Sign-in failed. Try again.");
        return;
      }
      await navigate({ to: "/" });
    } catch {
      setError("Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium tracking-[0.16em] text-faint uppercase">Line Desk</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">Sign in to the desk</h1>
        <p className="mt-2 text-sm text-muted">
          Email and password. After that, create the WordPressistic desk or join it with the team
          code.
        </p>
        <form className="mt-6 grid gap-3" onSubmit={submit}>
          {mode === "signup" ? (
            <input
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 rounded-md border border-line bg-surface px-3 text-sm text-fg outline-none placeholder:text-faint"
            />
          ) : null}
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@wpistic.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-md border border-line bg-surface px-3 text-sm text-fg outline-none placeholder:text-faint"
          />
          <input
            type="password"
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 rounded-md border border-line bg-surface px-3 text-sm text-fg outline-none placeholder:text-faint"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
          }}
          className="mt-3 text-sm text-muted underline underline-offset-4"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
        {authEnabled && brokerEnabled ? (
          <div className="mt-6 grid gap-2">
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
                className="min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-medium text-fg"
              >
                Continue with {provider.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
