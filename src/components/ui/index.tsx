import clsx from "clsx";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-5 sm:mb-6">
      {back && (
        <Link
          href={back.href}
          className="-ml-1 mb-2 inline-flex items-center gap-0.5 rounded-lg px-1 py-0.5 text-sm text-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("card", className)} {...props} />;
}

export function CardHeader({
  title,
  action,
  description,
}: {
  title: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "brand" | "dark";

const toneClass: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-2 ring-line",
  ok: "bg-ok-soft text-ok ring-ok/20",
  warn: "bg-warn-soft text-warn ring-warn/20",
  bad: "bg-bad-soft text-bad ring-bad/20",
  info: "bg-info-soft text-info ring-info/20",
  brand: "bg-brand-soft text-ink ring-brand-strong/40",
  dark: "bg-ink text-white ring-ink",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">
        {label}
        {required && <span className="ml-0.5 text-bad">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand-soft text-ink">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "warn" | "bad" | "ok";
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted sm:text-sm">{label}</span>
        {icon && (
          <span
            className={clsx(
              "grid size-8 place-items-center rounded-lg",
              tone === "neutral" && "bg-canvas text-ink-2",
              tone === "warn" && "bg-warn-soft text-warn",
              tone === "bad" && "bg-bad-soft text-bad",
              tone === "ok" && "bg-ok-soft text-ok",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="tabular mt-2 text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </>
  );
  const cls = "card block p-4 transition";
  return href ? (
    <Link href={href} className={clsx(cls, "hover:border-ink/25 hover:shadow-sm")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function DefinitionList({ items }: { items: { label: ReactNode; value: ReactNode; full?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-sm">
      {items.map((it, i) => (
        <div key={i} className={clsx("min-w-0", it.full && "col-span-2")}>
          <dt className="text-xs text-muted">{it.label}</dt>
          <dd className="mt-0.5 font-medium break-words">{it.value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "warn" | "bad" | "ok";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={clsx(
        "rounded-xl px-3.5 py-2.5 text-sm",
        tone === "info" && "bg-info-soft text-info",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "bad" && "bg-bad-soft text-bad",
        tone === "ok" && "bg-ok-soft text-ok",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-line/70", className)} />;
}

export function Tabs({ items }: { items: { href: string; label: ReactNode; active: boolean; count?: number }[] }) {
  return (
    <nav className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex gap-1 rounded-xl bg-line/50 p-1">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
              it.active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {it.label}
            {it.count !== undefined && it.count > 0 && (
              <span
                className={clsx(
                  "tabular rounded-full px-1.5 text-[11px]",
                  it.active ? "bg-brand text-ink" : "bg-line text-ink-2",
                )}
              >
                {it.count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
