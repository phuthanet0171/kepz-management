export type UnitKind = "storage" | "parking";
export type UnitStatus = "available" | "occupied" | "maintenance" | "inactive";
export type BillingCycle = "monthly" | "semiannual" | "annual";
export type ContractStatus = "active" | "ended" | "cancelled";
export type InvoiceStatus = "unpaid" | "partial" | "paid" | "void";
export type ItemType = "rent" | "late_fee" | "other" | "discount";
export type PaymentMethod = "transfer" | "credit_card";
export type DepositTxnType = "receive" | "refund" | "deduct";
export type TenantType = "individual" | "company";

export interface Settings {
  id: number;
  business_name: string;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
  tax_id: string | null;
  vat_enabled: boolean;
  vat_rate: number;
  vat_inclusive: boolean;
  invoice_prefix: string;
  receipt_prefix: string;
  contract_prefix: string;
  payment_instructions: string | null;
  contract_terms: string | null;
  due_soon_days: number;
  expiring_soon_days: number;
}

export interface UnitType {
  code: string;
  name: string;
  kind: UnitKind;
  size_label: string | null;
  code_prefix: string;
  default_monthly_price: number;
  sort_order: number;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UnitView {
  id: string;
  branch_id: string;
  branch_name: string;
  unit_type_code: string;
  unit_type_name: string;
  kind: UnitKind;
  type_sort: number;
  code: string;
  monthly_price: number | null;
  effective_price: number;
  is_maintenance: boolean;
  is_active: boolean;
  note: string | null;
  contract_id: string | null;
  contract_no: string | null;
  contract_end_date: string | null;
  contract_rent: number | null;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  status: UnitStatus;
  is_expiring: boolean;
}

export interface Tenant {
  id: string;
  tenant_type: TenantType;
  full_name: string;
  phone: string;
  email: string | null;
  line_id: string | null;
  id_number: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  note: string | null;
  created_at: string;
}

export interface ContractView {
  id: string;
  contract_no: string;
  unit_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  billing_cycle: BillingCycle;
  monthly_rent: number;
  deposit_amount: number;
  status: ContractStatus;
  ended_on: string | null;
  end_reason: string | null;
  note: string | null;
  created_at: string;
  unit_code: string;
  unit_type_code: string;
  unit_type_name: string;
  branch_id: string;
  branch_name: string;
  tenant_name: string;
  tenant_phone: string;
  deposit_balance: number;
  is_expiring: boolean;
  outstanding: number;
}

export interface InvoiceView {
  id: string;
  invoice_no: string;
  contract_id: string;
  period_start: string | null;
  period_end: string | null;
  issue_date: string;
  due_date: string;
  subtotal: number;
  vat_rate: number;
  vat_inclusive: boolean;
  vat_amount: number;
  total: number;
  paid_amount: number;
  status: InvoiceStatus;
  note: string | null;
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
  outstanding: number;
  is_overdue: boolean;
  days_overdue: number;
  contract_no: string;
  unit_id: string;
  unit_code: string;
  branch_id: string;
  branch_name: string;
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  sort_order: number;
  item_type: ItemType;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface Payment {
  id: string;
  receipt_no: string;
  invoice_id: string;
  paid_on: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  slip_path: string | null;
  note: string | null;
  is_void: boolean;
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
}

export interface DepositTxn {
  id: string;
  contract_id: string;
  txn_type: DepositTxnType;
  amount: number;
  txn_date: string;
  method: PaymentMethod | null;
  reference: string | null;
  note: string | null;
  created_at: string;
}

export interface ContractRenewal {
  id: string;
  contract_id: string;
  previous_end_date: string;
  new_end_date: string;
  previous_rent: number;
  new_rent: number;
  note: string | null;
  created_at: string;
}

export interface BillingDue {
  contract_id: string;
  contract_no: string;
  unit_code: string;
  branch_id: string;
  branch_name: string;
  tenant_name: string;
  tenant_phone: string;
  billing_cycle: BillingCycle;
  monthly_rent: number;
  end_date: string;
  period_start: string;
  period_end: string;
  months: number;
  is_partial: boolean;
  is_due: boolean;
}

/** ผลลัพธ์ของ Server Action ที่ใช้กับ useActionState */
export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

export interface FloorPlan {
  id: string;
  branch_id: string;
  name: string;
  cols: number;
  rows: number;
  sort_order: number;
}

export interface Placement {
  unit_id: string;
  floor_plan_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** ข้อมูลห้องที่ใช้แสดงบนผัง */
export interface PlanUnit {
  id: string;
  code: string;
  unit_type_code: string;
  unit_type_name: string;
  type_sort: number;
  status: UnitStatus;
  is_expiring: boolean;
  tenant_name: string | null;
  has_overdue: boolean;
}
