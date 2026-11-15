import { Badge } from "@/components/ui";
import { CONTRACT_STATUS_LABEL, INVOICE_STATUS_LABEL, UNIT_STATUS_LABEL } from "@/lib/format";
import type { ContractStatus, InvoiceStatus, UnitStatus } from "@/lib/types";

export function UnitStatusBadge({ status, expiring }: { status: UnitStatus; expiring?: boolean }) {
  if (status === "occupied" && expiring) return <Badge tone="warn">ใกล้หมดสัญญา</Badge>;
  const tone = { available: "ok", occupied: "dark", maintenance: "neutral", inactive: "neutral" } as const;
  return <Badge tone={tone[status]}>{UNIT_STATUS_LABEL[status]}</Badge>;
}

export function ContractStatusBadge({ status, expiring }: { status: ContractStatus; expiring?: boolean }) {
  if (status === "active" && expiring) return <Badge tone="warn">ใกล้หมดสัญญา</Badge>;
  const tone = { active: "ok", ended: "neutral", cancelled: "bad" } as const;
  return <Badge tone={tone[status]}>{CONTRACT_STATUS_LABEL[status]}</Badge>;
}

export function InvoiceStatusBadge({ status, overdue, days }: { status: InvoiceStatus; overdue?: boolean; days?: number }) {
  if (overdue) return <Badge tone="bad">เกินกำหนด {days ? `${days} วัน` : ""}</Badge>;
  const tone = { unpaid: "warn", partial: "info", paid: "ok", void: "neutral" } as const;
  return <Badge tone={tone[status]}>{INVOICE_STATUS_LABEL[status]}</Badge>;
}
