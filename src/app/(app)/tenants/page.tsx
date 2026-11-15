import { ChevronRight, Phone, Plus, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { fetchAll } from "@/lib/data";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ContractView, Tenant } from "@/lib/types";

export const metadata: Metadata = { title: "ผู้เช่า" };

export default async function TenantsPage({ searchParams }: PageProps<"/tenants">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const supabase = await createClient();

  const [tenants, contracts] = await Promise.all([
    fetchAll<Tenant>((from, to) => {
      let query = supabase.from("tenants").select("*").order("full_name").range(from, to);
      if (q) {
        const safe = q.replace(/[,()*%\\]/g, " ");
        query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,line_id.ilike.%${safe}%`);
      }
      return query;
    }),
    fetchAll<Pick<ContractView, "tenant_id" | "unit_code" | "outstanding">>((from, to) =>
      supabase.from("v_contracts").select("tenant_id, unit_code, outstanding").eq("status", "active").order("id").range(from, to),
    ),
  ]);

  const active = new Map<string, { units: string[]; outstanding: number }>();
  for (const c of contracts) {
    const a = active.get(c.tenant_id) ?? { units: [], outstanding: 0 };
    a.units.push(c.unit_code);
    a.outstanding += Number(c.outstanding);
    active.set(c.tenant_id, a);
  }

  return (
    <>
      <PageHeader
        title="ผู้เช่า"
        subtitle={`${tenants.length} ราย${q ? ` ที่ตรงกับ “${q}”` : ""}`}
        actions={
          <Link href="/tenants/new" className="btn btn-primary">
            <Plus className="size-4" /> เพิ่มผู้เช่า
          </Link>
        }
      />

      <form className="relative mb-4" action="/tenants">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="ค้นหาชื่อ เบอร์โทร หรือ LINE ID"
          className="input pl-10"
          type="search"
          enterKeyHint="search"
        />
      </form>

      <Card>
        {tenants.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title={q ? "ไม่พบผู้เช่า" : "ยังไม่มีผู้เช่า"}
            description={q ? "ลองค้นหาด้วยคำอื่น" : "เพิ่มผู้เช่าได้ที่นี่ หรือระหว่างทำสัญญาเช่า"}
          />
        ) : (
          <ul className="divide-y divide-line">
            {tenants.map((t) => {
              const a = active.get(t.id);
              return (
                <li key={t.id}>
                  <Link href={`/tenants/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-canvas/50 sm:px-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold">
                      {t.full_name.trim().charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{t.full_name}</span>
                        {t.tenant_type === "company" && <Badge>นิติบุคคล</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <Phone className="size-3" /> {t.phone}
                        {a && <span className="truncate">· {a.units.join(", ")}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {a ? <Badge tone="ok">เช่าอยู่ {a.units.length}</Badge> : <Badge>ไม่มีสัญญา</Badge>}
                      {a && a.outstanding > 0 && (
                        <span className="tabular text-xs font-medium text-bad">ค้าง {money(a.outstanding)}</span>
                      )}
                    </div>
                    <ChevronRight className="hidden size-4 text-muted sm:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
