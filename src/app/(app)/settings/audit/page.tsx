import clsx from "clsx";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { thDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ประวัติการแก้ไข" };

const PAGE_SIZE = 50;

type Log = {
  id: number;
  table_name: string;
  record_id: string | null;
  action: "insert" | "update" | "delete";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
};

const GROUPS: { key: string; label: string; tables: string[] }[] = [
  { key: "all", label: "ทั้งหมด", tables: [] },
  { key: "money", label: "บิลและใบเสร็จ", tables: ["invoices", "invoice_items", "payments", "deposit_transactions"] },
  { key: "contracts", label: "สัญญา", tables: ["contracts", "contract_renewals"] },
  { key: "tenants", label: "ผู้เช่า", tables: ["tenants"] },
  { key: "units", label: "ห้องและสาขา", tables: ["units", "branches", "branch_unit_types", "unit_types", "floor_plans"] },
  { key: "system", label: "ตั้งค่าและผู้ใช้", tables: ["settings", "app_users"] },
];

const TABLE_LABEL: Record<string, string> = {
  invoices: "ใบวางบิล",
  invoice_items: "รายการในบิล",
  payments: "ใบเสร็จ",
  deposit_transactions: "เงินประกัน",
  contracts: "สัญญา",
  contract_renewals: "ต่อสัญญา",
  tenants: "ผู้เช่า",
  units: "ห้อง",
  branches: "สาขา",
  branch_unit_types: "ราคาห้องของสาขา",
  unit_types: "ประเภทห้อง",
  floor_plans: "ผังสถานที่",
  settings: "ตั้งค่า",
  app_users: "ผู้ใช้งาน",
};

const ACTION: Record<Log["action"], { label: string; cls: string }> = {
  insert: { label: "เพิ่ม", cls: "bg-ok-soft text-ok" },
  update: { label: "แก้ไข", cls: "bg-info-soft text-info" },
  delete: { label: "ลบ", cls: "bg-bad-soft text-bad" },
};

const FIELD_LABEL: Record<string, string> = {
  status: "สถานะ",
  total: "ยอดรวม",
  subtotal: "ยอดก่อนภาษี",
  paid_amount: "ชำระแล้ว",
  amount: "จำนวนเงิน",
  due_date: "ครบกำหนด",
  issue_date: "วันที่ออก",
  period_start: "รอบเริ่ม",
  period_end: "รอบสิ้นสุด",
  void_reason: "เหตุผลยกเลิก",
  is_void: "ยกเลิก",
  paid_on: "วันที่ชำระ",
  method: "ช่องทาง",
  reference: "เลขอ้างอิง",
  monthly_rent: "ค่าเช่า/เดือน",
  deposit_amount: "เงินประกัน",
  start_date: "วันเริ่ม",
  end_date: "วันสิ้นสุด",
  billing_cycle: "รอบชำระ",
  unit_id: "ห้อง",
  tenant_id: "ผู้เช่า",
  full_name: "ชื่อ",
  phone: "โทร",
  address: "ที่อยู่",
  id_number: "เลขบัตร/เลขผู้เสียภาษี",
  code: "รหัส",
  name: "ชื่อ",
  monthly_price: "ราคา/เดือน",
  is_maintenance: "ปิดปรับปรุง",
  is_active: "เปิดใช้งาน",
  note: "หมายเหตุ",
  purpose: "เพื่อใช้",
  role: "สิทธิ์",
  display_name: "ชื่อที่แสดง",
  vat_rate: "VAT %",
  wht_rate: "หัก ณ ที่จ่าย %",
  description: "รายละเอียด",
  quantity: "จำนวน",
  unit_price: "ราคาต่อหน่วย",
  txn_type: "ประเภท",
  new_end_date: "วันสิ้นสุดใหม่",
  new_rent: "ค่าเช่าใหม่",
};

const SKIP = new Set(["id", "created_at", "updated_at", "voided_at", "contract_template_storage", "contract_template_parking"]);

/** ชื่อที่อ่านเข้าใจของรายการ เช่น เลขบิล รหัสห้อง ชื่อผู้เช่า */
function recordName(l: Log) {
  const d = (l.new_data ?? l.old_data ?? {}) as Record<string, unknown>;
  const v = d.invoice_no ?? d.receipt_no ?? d.contract_no ?? d.full_name ?? d.display_name ?? d.email ?? d.name ?? d.code ?? d.description;
  return v ? String(v) : "";
}

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

function changes(l: Log) {
  if (l.action !== "update" || !l.old_data || !l.new_data) return [];
  const o = l.old_data;
  const n = l.new_data;
  return Object.keys(n)
    .filter((k) => !SKIP.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => ({ key: k, label: FIELD_LABEL[k] ?? k, from: show(o[k]), to: show(n[k]) }));
}

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  await requireOwner();
  const sp = await searchParams;
  const group = GROUPS.find((g) => g.key === sp.type) ?? GROUPS[0];
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE); // ขอเกิน 1 แถวเพื่อรู้ว่ามีหน้าถัดไป
  if (group.tables.length) query = query.in("table_name", group.tables);

  const [{ data, error }, { data: users }] = await Promise.all([
    query,
    supabase.from("app_users").select("user_id, display_name, email"),
  ]);
  const rows = ((data ?? []) as Log[]).slice(0, PAGE_SIZE);
  const hasNext = (data ?? []).length > PAGE_SIZE;
  const who = new Map((users ?? []).map((u) => [u.user_id as string, (u.display_name || u.email || "ผู้ใช้") as string]));
  const href = (p: { type?: string; page?: number }) => {
    const q = new URLSearchParams();
    const t = p.type ?? group.key;
    if (t !== "all") q.set("type", t);
    if ((p.page ?? 1) > 1) q.set("page", String(p.page));
    const s = q.toString();
    return `/settings/audit${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="ประวัติการแก้ไข"
        back={{ href: "/settings", label: "ตั้งค่า" }}
      />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={href({ type: g.key })}
            className={clsx(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition",
              g.key === group.key ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-ink/30",
            )}
          >
            {g.label}
          </Link>
        ))}
      </div>

      {error ? (
        <Card className="p-5 text-sm text-bad">โหลดประวัติไม่สำเร็จ กรุณาลองใหม่</Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<History className="size-6" />} title="ยังไม่มีประวัติในหมวดนี้" />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((l) => {
              const diff = changes(l);
              const a = ACTION[l.action] ?? ACTION.update;
              const name = recordName(l);
              return (
                <li key={l.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", a.cls)}>{a.label}</span>
                    <span className="text-sm font-semibold">
                      {TABLE_LABEL[l.table_name] ?? l.table_name}
                      {name && <span className="font-normal text-ink-2"> · {name}</span>}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {thDateTime(l.changed_at)} · โดย {l.changed_by ? (who.get(l.changed_by) ?? "ผู้ใช้ที่ถูกลบแล้ว") : "ระบบ"}
                  </div>
                  {diff.length > 0 && (
                    <ul className="mt-2 space-y-1 rounded-xl bg-canvas px-3 py-2 text-xs">
                      {diff.slice(0, 6).map((d) => (
                        <li key={d.key} className="break-words">
                          <span className="text-muted">{d.label}:</span> <span className="text-muted line-through">{d.from}</span>{" "}
                          → <b>{d.to}</b>
                        </li>
                      ))}
                      {diff.length > 6 && <li className="text-muted">และอีก {diff.length - 6} ช่อง</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {(page > 1 || hasNext) && (
        <div className="mt-4 flex items-center justify-between">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="btn btn-outline btn-sm">
              <ChevronLeft className="size-4" /> ใหม่กว่า
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted">หน้า {page}</span>
          {hasNext ? (
            <Link href={href({ page: page + 1 })} className="btn btn-outline btn-sm">
              เก่ากว่า <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
