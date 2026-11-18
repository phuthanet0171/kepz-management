"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { money } from "@/lib/format";
import { VAT_RATE, WHT_RATE, type TaxBreakdown, type TaxChoice } from "@/lib/tax";

function Toggle({
  on,
  onClick,
  title,
  hint,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex w-full items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition disabled:opacity-60",
        on ? "border-ink bg-brand-soft" : "border-line bg-surface hover:border-ink/40",
      )}
    >
      <span
        className={clsx(
          "relative h-6 w-11 shrink-0 rounded-full transition",
          on ? "bg-ink" : "bg-line",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 grid size-5 place-items-center rounded-full bg-white shadow transition-all",
            on ? "left-[1.375rem]" : "left-0.5",
          )}
        >
          {on && <Check className="size-3 text-ink" strokeWidth={3} />}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
}

/** เลือกภาษีของใบวางบิล: VAT 7% / หัก ณ ที่จ่าย 5% (เลือกได้ทั้งคู่) */
export function TaxPicker({
  value,
  onChange,
  disabled,
}: {
  value: TaxChoice;
  onChange: (v: TaxChoice) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <input type="hidden" name="vat" value={value.vat ? "1" : "0"} />
      <input type="hidden" name="vat_inclusive" value={value.inclusive ? "1" : "0"} />
      <input type="hidden" name="wht" value={value.wht ? "1" : "0"} />

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Toggle
          on={value.vat}
          onClick={() => onChange({ ...value, vat: !value.vat })}
          title={`ภาษีมูลค่าเพิ่ม ${VAT_RATE}%`}
          hint="ใบเสร็จจะเป็นใบเสร็จรับเงิน/ใบกำกับภาษี"
          disabled={disabled}
        />
        <Toggle
          on={value.wht}
          onClick={() => onChange({ ...value, wht: !value.wht })}
          title={`หัก ณ ที่จ่าย ${WHT_RATE}%`}
          hint="ลูกค้านิติบุคคลหักภาษีค่าเช่าไว้ก่อนโอน"
          disabled={disabled}
        />
      </div>

      {value.vat && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-line/50 p-1 text-sm">
          {[
            { v: true, label: "ราคานี้รวม VAT แล้ว" },
            { v: false, label: "บวก VAT เพิ่มจากราคา" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, inclusive: o.v })}
              className={clsx(
                "rounded-lg px-3 py-2 font-medium transition",
                value.inclusive === o.v ? "bg-surface shadow-sm" : "text-muted",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={clsx("flex justify-between", tone ?? "text-muted")}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

/** สรุปยอดตามภาษีที่เลือก */
export function TaxSummary({ t, choice, className }: { t: TaxBreakdown; choice: TaxChoice; className?: string }) {
  return (
    <div className={clsx("space-y-1.5 text-sm", className)}>
      {choice.vat && (
        <>
          <Row label="มูลค่าก่อนภาษี" value={money(t.subtotal)} />
          <Row label={`ภาษีมูลค่าเพิ่ม ${VAT_RATE}%`} value={money(t.vat)} />
        </>
      )}
      {choice.wht && (
        <>
          <Row label={choice.vat ? "รวมเป็นเงิน" : "ค่าเช่าและบริการ"} value={money(t.gross)} />
          <Row label={`หัก ณ ที่จ่าย ${WHT_RATE}%`} value={`−${money(t.wht)}`} tone="text-bad" />
        </>
      )}
      <div className="flex justify-between text-base font-bold text-ink">
        <span>{choice.wht ? "ยอดชำระสุทธิ" : "ยอดรวมทั้งสิ้น"}</span>
        <span className={clsx("tabular", t.total < 0 && "text-bad")}>{money(t.total)} บาท</span>
      </div>
    </div>
  );
}
