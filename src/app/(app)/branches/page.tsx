import { requireOwner } from "@/lib/auth";
import { Building2, ChevronRight, MapPin, Phone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { fetchAll, getBranches } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { UnitView } from "@/lib/types";

export const metadata: Metadata = { title: "สาขา" };

export default async function BranchesPage() {
  await requireOwner();
  const supabase = await createClient();
  const [branches, units] = await Promise.all([
    getBranches(),
    fetchAll<Pick<UnitView, "branch_id" | "status" | "kind">>((from, to) =>
      supabase.from("v_units").select("branch_id, status, kind").neq("status", "inactive").order("id").range(from, to),
    ),
  ]);

  const stats = new Map<string, { total: number; occupied: number; available: number; parking: number }>();
  for (const u of units) {
    const s = stats.get(u.branch_id) ?? { total: 0, occupied: 0, available: 0, parking: 0 };
    s.total++;
    if (u.status === "occupied") s.occupied++;
    if (u.status === "available") s.available++;
    if (u.kind === "parking") s.parking++;
    stats.set(u.branch_id, s);
  }

  return (
    <>
      <PageHeader
        title="สาขา"
        subtitle={`ทั้งหมด ${branches.length} สาขา`}
        actions={
          <Link href="/branches/new" className="btn btn-primary">
            <Plus className="size-4" /> เพิ่มสาขา
          </Link>
        }
      />

      {branches.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="ยังไม่มีสาขา"
            description="เริ่มต้นด้วยการเพิ่มสาขาแรก และระบุจำนวนห้องแต่ละไซส์กับที่จอดรถ ระบบจะสร้างรหัสห้องให้อัตโนมัติ"
            action={
              <Link href="/branches/new" className="btn btn-primary">
                <Plus className="size-4" /> เพิ่มสาขาแรก
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {branches.map((b) => {
            const s = stats.get(b.id) ?? { total: 0, occupied: 0, available: 0, parking: 0 };
            const rate = s.total ? Math.round((s.occupied / s.total) * 100) : 0;
            return (
              <Link key={b.id} href={`/branches/${b.id}`} className="card group block min-w-0 p-4 transition hover:border-ink/25 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">{b.name}</h2>
                      {!b.is_active && <Badge>ปิดใช้งาน</Badge>}
                    </div>
                    {b.address && (
                      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-muted">
                        <MapPin className="size-3.5 shrink-0" /> <span className="min-w-0 truncate">{b.address}</span>
                      </p>
                    )}
                    {b.phone && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                        <Phone className="size-3.5 shrink-0" /> {b.phone}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted transition group-hover:translate-x-0.5" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-canvas py-2">
                    <div className="tabular text-lg font-bold">{s.total}</div>
                    <div className="text-xs text-muted">ทั้งหมด</div>
                  </div>
                  <div className="rounded-xl bg-canvas py-2">
                    <div className="tabular text-lg font-bold">{s.occupied}</div>
                    <div className="text-xs text-muted">มีผู้เช่า</div>
                  </div>
                  <div className="rounded-xl bg-ok-soft py-2 text-ok">
                    <div className="tabular text-lg font-bold">{s.available}</div>
                    <div className="text-xs">ว่าง</div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-muted">
                    <span>อัตราการเช่า</span>
                    <span className="tabular font-medium text-ink">{rate}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${rate}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
