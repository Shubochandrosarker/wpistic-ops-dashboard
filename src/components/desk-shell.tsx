import { Link, useRouterState } from "@tanstack/react-router";
import { Mail, MessageCircle, MessageSquareText, Settings2, Smartphone } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useDesk } from "@/lib/desk-store";
import { registerDeskFn } from "@/lib/fns";
import { SignInButtons, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatPhone } from "@/lib/phone";

const NAV = [
  { to: "/", label: "Inbox", icon: MessageSquareText },
  { to: "/mail", label: "Mail", icon: Mail },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/sms", label: "Texts", icon: Smartphone },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function DeskShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hydrated = useDesk((state) => state.hydrated);
  const label = useDesk((state) => state.businessLabel);
  const number = useDesk((state) => state.businessNumber);
  const connected = useDesk((state) => Boolean(state.apiKey));
  const token = useDesk((state) => state.deskToken);
  const publicKey = useDesk((state) => state.publicKey);

  useEffect(() => {
    void useDesk.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!hydrated || !token) return;
    void registerDeskFn({
      data: { token, publicKey, number },
    }).catch(() => undefined);
  }, [hydrated, token, publicKey, number]);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg md:grid md:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-line md:flex md:flex-col md:px-4 md:py-6">
        <Brand label={label} number={number} connected={connected} />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink key={item.to} {...item} active={isActive(pathname, item.to)} />
          ))}
        </nav>
        <div className="mt-auto pt-6">
          <UserButton />
        </div>
      </aside>
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:hidden">
          <div>
            <p className="text-sm font-medium">{label || "Line Desk"}</p>
            <p className="font-mono text-xs text-faint">{formatPhone(number)}</p>
          </div>
          <span className={cn("text-xs", connected ? "text-pine" : "text-warn")}>
            {connected ? "Live" : "Setup"}
          </span>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden pb-20 md:pb-0">
          <DeskAccess>{children}</DeskAccess>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs",
                  active ? "text-fg" : "text-faint",
                )}
              >
                <Icon size={18} strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function DeskAccess({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <p className="px-4 py-6 text-sm text-muted">Checking the session…</p>;
  if (!user) {
    return (
      <div className="grid h-full place-items-center px-4">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-medium tracking-tight">Sign in to work the desk</h2>
          <p className="mt-2 mb-4 text-sm text-muted">
            Google or X. Then create the team desk or join it with the code.
          </p>
          <SignInButtons />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function Brand({
  label,
  number,
  connected,
}: {
  label: string;
  number: string;
  connected: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium tracking-[0.16em] text-faint uppercase">Support desk</p>
      <h1 className="mt-2 text-xl font-medium tracking-tight">{label || "Business line"}</h1>
      <p className="mt-1 font-mono text-xs text-muted">{formatPhone(number)}</p>
      <p className={cn("mt-3 text-xs", connected ? "text-pine" : "text-warn")}>
        {connected ? "Telnyx connected" : "API key needed"}
      </p>
    </div>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: (typeof NAV)[number]["to"];
  label: string;
  icon: (typeof NAV)[number]["icon"];
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm",
        active ? "bg-raised text-fg" : "text-muted hover:bg-raised hover:text-fg",
      )}
    >
      <Icon size={18} strokeWidth={1.75} />
      {label}
    </Link>
  );
}

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
