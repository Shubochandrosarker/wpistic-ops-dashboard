import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · Line Desk" }] }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium tracking-[0.16em] text-faint uppercase">Line Desk</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">Sign in to the desk</h1>
        <p className="mt-2 text-sm text-muted">
          Google or X. After that, create the WordPressistic desk or join it with the team code.
        </p>
        <div className="mt-6 grid gap-2">
          {authEnabled ? (
            GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
                className="min-h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
              >
                Continue with {provider.label}
              </button>
            ))
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled.</p>
          )}
        </div>
      </div>
    </main>
  );
}
