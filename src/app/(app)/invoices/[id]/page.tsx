import { Paperclip, Phone, Printer, StickyNote } from "lucide-react";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceStatusBadge } from "@/components/status";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { money, PAYMENT_METHOD_LABEL, thDate, thDateTime, todayTH } from "@/lib/format";
import { getSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceItem, InvoiceView, Payment } from "@/lib/types";
import { RecordPaymentButton, VoidInvoiceButton, VoidPaymentButton } from "./payment-actions";
import { InvoiceTaxPanel } from "./tax-panel";

export const metadata: Metadata = { title: "ใบวางบิล" };

export default async function InvoicePage({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: invData }, { data: itemData }, { data: payData }, settings] = await Promise.all([
    supabase.from("v_invoices").select("*").eq("id", id).maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
    supabase.from("payments").select("*").eq("invoice_id", id).order("paid_on").order("created_at"),
    getSettings(),
  ]);
  if (!invData) notFound();
  const inv = invData as InvoiceView;
  const items = (itemData ?? []) as InvoiceItem[];
  const payments = (payData ?? []) as Payment[];

  const slipPaths = payments.map((p) => p.slip_path).filter((p): p is string => Boolean(p));
  const slipUrls = new Map<string, string>();
  if (slipPaths.length) {
    const { data } = await supabase.storage.from("slips").createSignedUrls(slipPaths, 60 * 60);
    for (const s of data ?? []) if (s.path && s.signedUrl) slipUrls.set(s.path, s.signedUrl);
  }

  const canPay = inv.status === "unpaid" || inv.status === "partial";
  const hasActivePayments = payments.some((p) => !p.is_void);
  const depositSum = items.filter((it) => it.item_type === "deposit").reduce((a, it) => a + Number(it.amount), 0);
  const itemsSum = items.reduce((a, it) => a + Number(it.amount), 0) - depositSum;
  const taxBase = Number(inv.subtotal) - depositSum;
  const hasVat = Number(inv.vat_rate) > 0;
  const hasWht = Number(inv.wht_rate) > 0;
  const taxLocked =
    inv.status === "void"
      ? "ใบนี้ถูกยกเลิกแล้ว"
      : hasActivePayments
        ? "มีการรับชำระแล้ว เปลี่ยนภาษีไม่ได้ (ต้องยกเลิกใบเสร็จก่อน)"
        : null;

  return (
    <>
      <PageHeader
        back={{ href: `/contracts/${inv.contract_id}`, label: inv.contract_no }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {inv.invoice_no} <InvoiceStatusBadge status={inv.status} overdue={inv.is_overdue} days={inv.days_overdue} />
          </span>
        }
        subtitle={`${inv.unit_code} · ${inv.tenant_name} · ${inv.branch_name}`}
      />

      {inv.status === "void" && (
        <Alert tone="bad" className="mb-4">
          ใบวางบิลนี้ถูกยกเลิกเมื่อ {thDateTime(inv.voided_at)} · เหตุผล: {inv.void_reason}
        </Alert>
      )}

      {/* ข้อมูลหลักของบิล ไว้บนสุดให้เห็นทันทีที่เข้าหน้า */}
      <Card className="mb-4 overflow-hidden">
        <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
          <InfoTile label={inv.status === "void" ? "ยอดตามบิล" : "ยอดคงค้าง"} highlight={inv.status !== "void" && Number(inv.outstanding) > 0}>
            <span className="tabular">{money(inv.status === "void" ? inv.total : inv.outstanding)}</span>
            <span className="ml-1 text-sm font-medium">บาท</span>
          </InfoTile>
          <InfoTile label="ครบกำหนดชำระ">
            <span className={inv.is_overdue ? "text-bad" : undefined}>{thDate(inv.due_date)}</span>
            {inv.is_overdue && <span className="block text-xs font-medium text-bad">เกินกำหนด {inv.days_overdue} วัน</span>}
          </InfoTile>
          <InfoTile label="รอบบิล">
            {inv.period_start ? (
              <span className="text-[15px]">
                {thDate(inv.period_start)} – {thDate(inv.period_end)}
              </span>
            ) : (
              <span className="text-[15px]">ค่าใช้จ่ายอื่น</span>
            )}
            <span className="block text-xs font-normal text-muted">ออกเมื่อ {thDate(inv.issue_date)}</span>
          </InfoTile>
          <InfoTile label="ผู้เช่า">
            <Link href={`/tenants/${inv.tenant_id}`} className="block truncate text-[15px] underline-offset-2 hover:underline">
              {inv.tenant_name}
            </Link>
            <a href={`tel:${inv.tenant_phone}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 underline-offset-2 hover:underline">
              <Phone className="size-3.5" /> {inv.tenant_phone}
            </a>
          </InfoTile>
        </div>
        {inv.note && (
          <div className="flex gap-2 border-t border-line bg-canvas/60 px-4 py-2.5 text-sm sm:px-5">
            <StickyNote className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>
              <span className="text-muted">หมายเหตุ: </span>
              {inv.note}
            </span>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader title="รายการ" />
            <ul className="divide-y divide-line">
              {items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <div className="font-medium">{it.description}</div>
                    <div className="tabular text-xs text-muted">
                      {Number(it.quantity)} × {money(Math.abs(it.unit_price))}
                    </div>
                  </div>
                  <span className={`tabular shrink-0 font-medium ${it.amount < 0 ? "text-bad" : ""}`}>{money(it.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5 border-t border-line bg-canvas/60 px-4 py-4 text-sm sm:px-5">
              {hasVat && (
                <>
                  <div className="flex justify-between text-muted">
                    <span>มูลค่าก่อนภาษี</span>
                    <span className="tabular">{money(taxBase)}</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>ภาษีมูลค่าเพิ่ม {Number(inv.vat_rate)}%</span>
                    <span className="tabular">{money(inv.vat_amount)}</span>
                  </div>
                </>
              )}
              {hasWht && (
                <>
                  <div className="flex justify-between text-muted">
                    <span>{hasVat ? "รวมเป็นเงิน" : "ค่าเช่าและบริการ"}</span>
                    <span className="tabular">{money(taxBase + Number(inv.vat_amount))}</span>
                  </div>
                  <div className="flex justify-between text-bad">
                    <span>หัก ณ ที่จ่าย {Number(inv.wht_rate)}%</span>
                    <span className="tabular">−{money(inv.wht_amount)}</span>
                  </div>
                </>
              )}
              {depositSum > 0 && (hasVat || hasWht) && (
                <div className="flex justify-between text-muted">
                  <span>เงินประกัน (ไม่คิดภาษี)</span>
                  <span className="tabular">{money(depositSum)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>{hasWht ? "ยอดชำระสุทธิ" : "ยอดรวมทั้งสิ้น"}</span>
                <span className="tabular">{money(inv.total)}</span>
              </div>
              <div className="flex justify-between text-ok">
                <span>ชำระแล้ว</span>
                <span className="tabular">{money(inv.paid_amount)}</span>
              </div>
              {inv.status !== "void" && (
                <div className={`flex justify-between font-semibold ${Number(inv.outstanding) > 0 ? "text-bad" : "text-ok"}`}>
                  <span>คงค้าง</span>
                  <span className="tabular">{money(inv.outstanding)}</span>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="การรับชำระ / ใบเสร็จ" description={`${payments.length} รายการ`} />
            {payments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">ยังไม่มีการชำระ</p>
            ) : (
              <ul className="divide-y divide-line">
                {payments.map((p) => (
                  <li key={p.id} className="px-4 py-3 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-medium ${p.is_void ? "text-muted line-through" : ""}`}>{p.receipt_no}</span>
                          {p.is_void && <Badge tone="bad">ยกเลิก</Badge>}
                        </div>
                        <div className="text-xs text-muted">
                          {thDate(p.paid_on)} · {PAYMENT_METHOD_LABEL[p.method]}
                          {p.reference && ` · อ้างอิง ${p.reference}`}
                        </div>
                        {p.note && <div className="text-xs text-muted">{p.note}</div>}
                        {p.is_void && <div className="text-xs text-bad">เหตุผล: {p.void_reason}</div>}
                      </div>
                      <span className={`tabular shrink-0 font-semibold ${p.is_void ? "text-muted line-through" : "text-ok"}`}>
                        {money(p.amount)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {!p.is_void && (
                        <Link href={`/print/receipt/${p.id}`} target="_blank" className="btn btn-outline btn-sm">
                          <Printer className="size-3.5" /> ใบเสร็จ
                        </Link>
                      )}
                      {p.slip_path && slipUrls.get(p.slip_path) && (
                        <a href={slipUrls.get(p.slip_path)} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                          <Paperclip className="size-3.5" /> ดูสลิป
                        </a>
                      )}
                      {!p.is_void && <VoidPaymentButton paymentId={p.id} receiptNo={p.receipt_no} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4 max-lg:order-first">
          <InvoiceTaxPanel
            key={`${inv.vat_rate}-${inv.vat_inclusive}-${inv.wht_rate}`}
            invoiceId={inv.id}
            itemsSum={itemsSum}
            depositSum={depositSum}
            initial={{ vat: hasVat, inclusive: inv.vat_inclusive, wht: hasWht }}
            lockedReason={taxLocked}
            hasTaxId={Boolean(settings.tax_id)}
            payButton={
              inv.status !== "void" && (
                <RecordPaymentButton
                  invoiceId={inv.id}
                  outstanding={Number(inv.outstanding)}
                  today={todayTH()}
                  label="ชำระเรียบร้อย พิมพ์ใบเสร็จ"
                  triggerClassName="btn btn-brand w-full"
                  hidden={!canPay}
                />
              )
            }
            voidButton={
              inv.status !== "void" &&
              !hasActivePayments && <VoidInvoiceButton invoiceId={inv.id} triggerClassName="btn btn-danger w-full" />
            }
          />
        </div>
      </div>
    </>
  );
}

function InfoTile({ label, highlight, children }: { label: string; highlight?: boolean; children: ReactNode }) {
  return (
    <div className={`min-w-0 border-b border-line px-4 py-3.5 sm:border-b-0 sm:px-5 ${highlight ? "bg-brand-soft" : ""}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-lg leading-snug font-bold">{children}</div>
    </div>
  );
}
