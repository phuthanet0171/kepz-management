"use client";

import clsx from "clsx";
import { AlertTriangle, Car, Eye, Package, PencilLine, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ContractDocument, type ContractBusiness } from "@/components/contract-document";
import { Card } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { FIELD_GROUPS, parseTemplate, unknownFields } from "@/lib/contract-template";
import type { UnitKind } from "@/lib/types";
import { saveContractTemplate } from "../actions";

export type PreviewSource = {
  label: string;
  fields: Record<string, string>;
  lessorName: string | null;
  tenantName: string;
};

type PerKind<T> = Record<UnitKind, T>;

const KINDS: { kind: UnitKind; label: string; icon: typeof Package }[] = [
  { kind: "storage", label: "ห้องเก็บของ", icon: Package },
  { kind: "parking", label: "ที่จอดรถ", icon: Car },
];

export function TemplateEditor({
  initial,
  defaults,
  previews,
  business,
}: {
  initial: PerKind<string | null>;
  defaults: PerKind<string>;
  previews: PerKind<PreviewSource>;
  business: ContractBusiness;
}) {
  const start = (k: UnitKind) => (initial[k]?.trim() ? initial[k]! : defaults[k]);
  const [kind, setKind] = useState<UnitKind>("storage");
  const [text, setText] = useState<PerKind<string>>({ storage: start("storage"), parking: start("parking") });
  const [saved, setSaved] = useState<PerKind<string>>({ storage: start("storage"), parking: start("parking") });
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const ref = useRef<HTMLTextAreaElement>(null);

  const value = text[kind];
  const preview = previews[kind];
  const isDefault = value.trim() === defaults[kind].trim();
  const dirty = (k: UnitKind) => text[k] !== saved[k];
  const blocks = useMemo(() => parseTemplate(value, preview.fields), [value, preview.fields]);
  const unknown = useMemo(() => unknownFields(value), [value]);

  const setValue = (v: string) => setText((t) => ({ ...t, [kind]: v }));

  function insert(snippet: string) {
    const el = ref.current;
    if (!el) return setValue(value + snippet);
    const { selectionStart: s, selectionEnd: e } = el;
    const next = value.slice(0, s) + snippet + value.slice(e);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + snippet.length, s + snippet.length);
    });
  }

  function resetToDefault() {
    if (!confirm(`แทนที่ถ้อยคำสัญญา${kind === "parking" ? "ที่จอดรถ" : "ห้องเก็บของ"}ด้วยแม่แบบตั้งต้น? (ยังไม่บันทึกจนกว่าจะกด “บันทึกแม่แบบ”)`)) return;
    setValue(defaults[kind]);
  }

  return (
    <div className="space-y-4">
      {/* เลือกประเภทสัญญา */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-line/50 p-1 sm:inline-grid">
        {KINDS.map(({ kind: k, label, icon: Icon }) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={clsx(
              "flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
              kind === k ? "bg-surface shadow-sm" : "text-muted",
            )}
          >
            <Icon className="size-4" /> สัญญา{label}
            {dirty(k) && <span className="size-2 rounded-full bg-warn" title="ยังไม่บันทึก" />}
          </button>
        ))}
      </div>

      {/* มือถือ: สลับแก้ไข / ตัวอย่าง */}
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <button type="button" onClick={() => setMobileView("edit")} className={clsx("btn btn-sm", mobileView === "edit" ? "btn-primary" : "btn-outline")}>
          <PencilLine className="size-4" /> แก้ไข
        </button>
        <button type="button" onClick={() => setMobileView("preview")} className={clsx("btn btn-sm", mobileView === "preview" ? "btn-primary" : "btn-outline")}>
          <Eye className="size-4" /> ดูตัวอย่าง
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={clsx("space-y-4", mobileView !== "edit" && "max-lg:hidden")}>
          <Card className="p-4 sm:p-5">
            <ActionForm action={saveContractTemplate} resetOnSuccess={false} onSuccess={() => setSaved((s) => ({ ...s, [kind]: value }))}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="reset" value={isDefault ? "1" : "0"} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">ถ้อยคำสัญญา{kind === "parking" ? "ที่จอดรถ" : "ห้องเก็บของ"}</span>
                <span className="text-xs text-muted">
                  {isDefault ? "ใช้แม่แบบตั้งต้น" : "แก้ไขเองแล้ว"}
                  {dirty(kind) && <span className="ml-2 font-medium text-warn">· ยังไม่บันทึก</span>}
                </span>
              </div>
              <textarea
                ref={ref}
                name="template"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={22}
                spellCheck={false}
                className="input min-h-[28rem] font-[inherit] text-sm leading-relaxed"
              />
              {unknown.length > 0 && (
                <div className="flex gap-2 rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    ไม่รู้จักช่อง {unknown.map((u) => `{${u}}`).join(", ")} — ตรวจการสะกด หรือเลือกจากปุ่มช่องข้อมูลด้านล่าง
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <SubmitButton>บันทึกแม่แบบ</SubmitButton>
                <button type="button" className="btn btn-outline" onClick={resetToDefault} disabled={isDefault}>
                  <RotateCcw className="size-4" /> คืนค่าแม่แบบเดิม
                </button>
              </div>
            </ActionForm>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="text-sm font-semibold">แทรกช่องข้อมูล</div>
            <p className="mt-0.5 text-xs text-muted">วางเคอร์เซอร์ในข้อความ แล้วกดปุ่มเพื่อแทรกตรงตำแหน่งนั้น</p>
            <div className="mt-3 space-y-3">
              {FIELD_GROUPS.map((g) => (
                <div key={g.title}>
                  <div className="mb-1.5 text-xs font-medium text-muted">{g.title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.fields.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insert(`{${f}}`)}
                        className="rounded-lg border border-line bg-surface px-2 py-1 text-xs transition hover:border-ink hover:bg-brand-soft"
                        title={preview.fields[f] ? `ตัวอย่าง: ${preview.fields[f]}` : undefined}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
              <div className="mb-1 font-medium text-ink">การจัดรูปแบบ</div>
              <div><code># ข้อความ</code> หัวเรื่องกลางหน้า · <code>## ข้อความ</code> หัวข้อตัวหนา</div>
              <div><code>**ข้อความ**</code> ตัวหนา · ขึ้นต้นด้วย <code>(ก)</code> <code>(1)</code> หรือ <code>-</code> เป็นข้อย่อยย่อหน้าเยื้อง</div>
              <div>บรรทัดว่างเว้นระยะ · ช่องลงชื่อผู้ให้เช่าและผู้เช่าระบบใส่ท้ายสัญญาให้เอง</div>
            </div>
          </Card>
        </div>

        <div className={clsx(mobileView !== "preview" && "max-lg:hidden")}>
          <div className="lg:sticky lg:top-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted">
              <Eye className="size-3.5" /> ตัวอย่าง: {preview.label}
            </div>
            <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl border border-line bg-white p-5 text-ink shadow-sm sm:p-8">
              <ContractDocument
                blocks={blocks}
                fields={preview.fields}
                kind={kind}
                business={business}
                lessorName={preview.lessorName}
                tenantName={preview.tenantName}
                preview
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              <span className="rounded bg-brand-soft px-1">ไฮไลต์เหลือง</span> = ข้อมูลที่ระบบเติมให้ · จุดไข่ปลา = ยังไม่มีข้อมูล เว้นให้เขียนด้วยมือ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
