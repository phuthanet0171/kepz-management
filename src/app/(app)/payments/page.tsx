import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { fetchAll } from "@/lib/data";
import { money, PAYMENT_METHOD_LABEL, thDate, thMonth, todayTH } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Payment, PaymentMethod } from "@/lib/types";

export const metadata: Metadata = { title: "รับชำระ" };

type Row = Payment & {
  invoices: { invoice_no: string; contracts: { units: { code: string }; tenants: { full_name: string } } };
};

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayTH().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;

  const supabase = await createClient();
  const rows = await fetchAll<Row>((from, to) =>
    supabase
      .from("payments")
      .select("*, invoices!inner(invoice_no, contracts!inner(units!inner(code), tenants!inner(full_name)))")
      .gte("paid_on", `${month}-01`)
      .lt("paid_on", `${next}-01`)
      .order("paid_on", { ascending: false })
      .order("receipt_no", { ascending: false })
      .range(from, to),
  );

  const active = rows.filter((r) => !r.is_void);
  const total = active.reduce((a, r) => a + Number(r.amount), 0);
  const byMethod = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((k) => ({
    key: k,
    label: PAYMENT_METHOD_LABEL[k],
    sum: active.filter((r) => r.method === k).reduce((a, r) => a + Number(r.amount), 0),
  }));

  return (
    <>
      <PageHeader
        title="รับชำระ"
        subtitle={`ใบเสร็จเดือน ${thMonth(month)}`}
        actions={
          <form className="flex gap-2" action="/payments">
            <input type="month" name="month" defaultValue={month} className="input w-40" aria-label="เดือน" />
            <button className="btn btn-outline">แสดง</button>
          </form>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="col-span-2 bg-ink p-4 text-white sm:col-span-1">
          <div className="text-sm text-white/60">รับชำระรวม</div>
          <div className="tabular mt-1 text-2xl font-bold">{money(total)}</div>
          <div className="text-xs text-white/50">{active.length} ใบเสร็จ</div>
        </Card>
        {byMethod.map((b) => (
          <Card key={b.key} className="p-4">
            <div className="text-sm text-muted">{b.label}</div>
            <div className="tabular mt-1 text-xl font-bold">{money(b.sum)}</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<Wallet className="size-6" />} title="ไม่มีการรับชำระในเดือนนี้" />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/invoices/${r.invoice_id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-canvas/50 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium ${r.is_void ? "text-muted line-through" : ""}`}>{r.receipt_no}</span>
                      {r.is_void && <Badge tone="bad">ยกเลิก</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {thDate(r.paid_on)} · {r.invoices.contracts.units.code} · {r.invoices.contracts.tenants.full_name} ·{" "}
                      {PAYMENT_METHOD_LABEL[r.method]}
                    </div>
                  </div>
                  <span className={`tabular shrink-0 font-semibold ${r.is_void ? "text-muted line-through" : ""}`}>{money(r.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
