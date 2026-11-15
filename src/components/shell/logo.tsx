import clsx from "clsx";

export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={clsx("inline-flex items-baseline font-bold tracking-tight", className)}>
      <span className={dark ? "text-white" : "text-ink"}>kepz</span>
      <span className="text-brand">.</span>
    </span>
  );
}
