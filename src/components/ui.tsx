import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "ghost" && "border border-line bg-transparent text-fg hover:bg-raised",
        variant === "danger" && "border border-line bg-transparent text-danger hover:bg-raised",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium text-fg">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-faint">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "min-h-11 w-full rounded-md border border-line bg-bg px-3 text-base text-fg outline-none placeholder:text-faint",
        props.className,
      )}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full resize-y rounded-md border border-line bg-bg px-3 py-3 text-base text-fg outline-none placeholder:text-faint",
        props.className,
      )}
    />
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface p-4 md:p-5", className)}>
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-medium tracking-tight">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "border-line text-muted",
        tone === "ok" && "border-line text-pine",
        tone === "warn" && "border-line text-warn",
        tone === "bad" && "border-line text-danger",
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "bad" }) {
  return (
    <p
      className={cn(
        "rounded-md border border-line bg-bg px-3 py-2 text-sm leading-6",
        tone === "bad" ? "text-danger" : "text-muted",
      )}
    >
      {children}
    </p>
  );
}
