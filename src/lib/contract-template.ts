/**
 * แม่แบบสัญญาเช่า: ข้อความที่ Owner แก้เองได้ในหน้าตั้งค่า พร้อมช่องข้อมูล {ชื่อช่อง}
 * ที่ระบบเติมจากสัญญาจริงตอนพิมพ์
 *
 * รูปแบบที่รองรับ (ต่อบรรทัด)
 *   # ข้อความ        หัวเรื่องกลางหน้า
 *   ## ข้อความ       หัวข้อ (ตัวหนา)
 *   **ข้อความ**      ตัวหนาบางส่วน
 *   (ก) / - / 1)     ข้อย่อย (ย่อหน้าเยื้อง)
 *   บรรทัดว่าง        เว้นระยะ
 * ไฟล์นี้ไม่มีโค้ดฝั่งเซิร์ฟเวอร์ ใช้ได้ทั้งหน้าพิมพ์และหน้าแก้แม่แบบ
 */
import { bahtText } from "./baht-text";
import { addDays, addMonths, BILLING_CYCLE_LABEL, BILLING_CYCLE_MONTHS, thDateLong } from "./format";
import type { BillingCycle, Branch, Settings, UnitKind } from "./types";

export type ContractTerms = {
  lessor_name: string | null;
  bank_account: string | null;
  rent_due_day: number;
  late_fee_per_day: number;
  reclaim_day: number;
  overstay_fee_per_day: number;
};

/** ค่ากลางจากตั้งค่า ทับด้วยค่าเฉพาะสาขา (ถ้ากรอกไว้) */
export function resolveContractTerms(
  s: Settings,
  b?: Partial<Pick<Branch, keyof ContractTerms>> | null,
): ContractTerms {
  const pick = <T,>(v: T | null | undefined, fallback: T) => (v === null || v === undefined || v === "" ? fallback : v);
  return {
    lessor_name: pick(b?.lessor_name, s.lessor_name),
    bank_account: pick(b?.bank_account, s.bank_account),
    rent_due_day: Number(pick(b?.rent_due_day, s.rent_due_day)),
    late_fee_per_day: Number(pick(b?.late_fee_per_day, s.late_fee_per_day)),
    reclaim_day: Number(pick(b?.reclaim_day, s.reclaim_day)),
    overstay_fee_per_day: Number(pick(b?.overstay_fee_per_day, s.overstay_fee_per_day)),
  };
}

export type ContractTemplateInput = {
  contract_no: string;
  signed_on: string;
  start_date: string;
  end_date: string;
  billing_cycle: BillingCycle;
  monthly_rent: number;
  deposit_amount: number;
  purpose: string | null;
  note: string | null;
  business_name: string;
  branch_name: string;
  branch_address: string | null;
  unit_code: string;
  unit_type_name: string;
  size_label: string | null;
  tenant: {
    full_name: string;
    phone: string;
    address: string | null;
    id_number: string | null;
    line_id: string | null;
  };
  terms: ContractTerms;
};

/** 1,600 หรือ 1,600.50 (ไม่ใส่ .00 ให้อ่านง่ายแบบสัญญากระดาษ) */
export function amountText(n: number) {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(n);
}

/** ระยะเวลาเช่า เช่น "6 เดือน", "1 ปี", "1 ปี 3 เดือน", "2 เดือน 10 วัน" */
export function durationText(start: string, end: string) {
  const after = addDays(end, 1);
  let months = 0;
  while (months < 1200 && addMonths(start, months + 1) <= after) months++;
  const from = addMonths(start, months);
  const days = Math.round((Date.parse(after) - Date.parse(from)) / 86_400_000);
  const parts: string[] = [];
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y) parts.push(`${y} ปี`);
  if (m) parts.push(`${m} เดือน`);
  if (days) parts.push(`${days} วัน`);
  return parts.join(" ") || "0 วัน";
}

const oneLine = (s: string | null | undefined) => (s ?? "").replace(/\s*\n\s*/g, " ").trim();

export function buildContractFields(d: ContractTemplateInput): Record<string, string> {
  const rent = Number(d.monthly_rent);
  const deposit = Number(d.deposit_amount);
  const months = BILLING_CYCLE_MONTHS[d.billing_cycle];
  // ค่าเช่าล่วงหน้า = ค่าเช่างวดแรก (ถ้าสัญญาสั้นกว่า 1 งวด คิดตามจำนวนเดือนจริงของสัญญา)
  const firstPeriodEnd = addDays(addMonths(d.start_date, months), -1);
  const advanceMonths = firstPeriodEnd > d.end_date ? Math.max(1, monthsCovered(d.start_date, d.end_date)) : months;
  const advance = rent * advanceMonths;
  const moveIn = deposit + advance;
  const depositMonths = rent > 0 && deposit > 0 && Math.abs(deposit / rent - Math.round(deposit / rent)) < 0.001
    ? String(Math.round(deposit / rent))
    : "";

  return {
    เลขที่สัญญา: d.contract_no,
    วันที่ทำสัญญา: thDateLong(d.signed_on),
    ชื่อกิจการ: d.business_name,
    ชื่อสาขา: d.branch_name,
    ที่อยู่สาขา: oneLine(d.branch_address),
    ชื่อผู้ให้เช่า: d.terms.lessor_name ?? "",
    บัญชีธนาคาร: oneLine(d.terms.bank_account),

    ชื่อผู้เช่า: d.tenant.full_name,
    เบอร์ผู้เช่า: d.tenant.phone,
    ที่อยู่ผู้เช่า: oneLine(d.tenant.address),
    เลขบัตรผู้เช่า: d.tenant.id_number ?? "",
    ไลน์ผู้เช่า: d.tenant.line_id ?? "",

    จำนวนห้อง: "1",
    เลขห้อง: d.unit_code,
    ประเภทห้อง: d.unit_type_name,
    ขนาดห้อง: d.size_label ?? "",
    สิ่งของที่เก็บ: d.purpose ?? "",
    ทะเบียนรถ: d.purpose ?? "",

    วันเริ่มสัญญา: thDateLong(d.start_date),
    วันสิ้นสุดสัญญา: thDateLong(d.end_date),
    ระยะเวลาเช่า: durationText(d.start_date, d.end_date),
    รอบชำระ: BILLING_CYCLE_LABEL[d.billing_cycle],
    เดือนต่องวด: String(months),

    ค่าเช่า: amountText(rent),
    ค่าเช่าตัวอักษร: bahtText(rent),
    ค่าเช่าต่องวด: amountText(rent * months),
    ค่าเช่าต่องวดตัวอักษร: bahtText(rent * months),
    เงินประกัน: amountText(deposit),
    เงินประกันตัวอักษร: deposit > 0 ? bahtText(deposit) : "ไม่มีเงินประกัน",
    เงินประกันกี่เดือน: depositMonths,
    เดือนล่วงหน้า: String(advanceMonths),
    ค่าเช่าล่วงหน้า: amountText(advance),
    ค่าเช่าล่วงหน้าตัวอักษร: bahtText(advance),
    ชำระแรกเข้ารวม: amountText(moveIn),
    ชำระแรกเข้ารวมตัวอักษร: bahtText(moveIn),

    ชำระภายในวันที่: String(d.terms.rent_due_day),
    ค่าปรับชำระล่าช้า: amountText(d.terms.late_fee_per_day),
    ยึดคืนหลังวันที่: String(d.terms.reclaim_day),
    ค่าปรับหลังหมดสัญญา: amountText(d.terms.overstay_fee_per_day),

    หมายเหตุ: oneLine(d.note),
  };
}

function monthsCovered(start: string, end: string) {
  const after = addDays(end, 1);
  let m = 0;
  while (m < 1200 && addMonths(start, m + 1) <= after) m++;
  return m;
}

/** รายการช่องข้อมูล แบ่งกลุ่มสำหรับปุ่มแทรกในหน้าแก้แม่แบบ */
export const FIELD_GROUPS: { title: string; fields: string[] }[] = [
  { title: "สัญญา", fields: ["เลขที่สัญญา", "วันที่ทำสัญญา", "วันเริ่มสัญญา", "วันสิ้นสุดสัญญา", "ระยะเวลาเช่า", "รอบชำระ", "เดือนต่องวด", "หมายเหตุ"] },
  { title: "ผู้ให้เช่า / สาขา", fields: ["ชื่อผู้ให้เช่า", "ชื่อกิจการ", "ชื่อสาขา", "ที่อยู่สาขา", "บัญชีธนาคาร"] },
  { title: "ผู้เช่า", fields: ["ชื่อผู้เช่า", "เบอร์ผู้เช่า", "ที่อยู่ผู้เช่า", "เลขบัตรผู้เช่า", "ไลน์ผู้เช่า"] },
  { title: "ห้อง / ที่จอด", fields: ["เลขห้อง", "จำนวนห้อง", "ประเภทห้อง", "ขนาดห้อง", "สิ่งของที่เก็บ", "ทะเบียนรถ"] },
  {
    title: "จำนวนเงิน",
    fields: [
      "ค่าเช่า", "ค่าเช่าตัวอักษร", "ค่าเช่าต่องวด", "ค่าเช่าต่องวดตัวอักษร",
      "เงินประกัน", "เงินประกันตัวอักษร", "เงินประกันกี่เดือน",
      "ค่าเช่าล่วงหน้า", "ค่าเช่าล่วงหน้าตัวอักษร", "เดือนล่วงหน้า",
      "ชำระแรกเข้ารวม", "ชำระแรกเข้ารวมตัวอักษร",
    ],
  },
  { title: "กำหนดชำระ / ค่าปรับ", fields: ["ชำระภายในวันที่", "ค่าปรับชำระล่าช้า", "ยึดคืนหลังวันที่", "ค่าปรับหลังหมดสัญญา"] },
];

export const ALL_FIELDS = new Set(FIELD_GROUPS.flatMap((g) => g.fields));

// ---------------------------------------------------------------------
// แม่แบบตั้งต้น (เรียบเรียงจากสัญญาเช่าห้องเก็บของฉบับที่ใช้อยู่)
// ---------------------------------------------------------------------

function commonClauses(place: string) {
  return `## ข้อ 3 กำหนดการชำระค่าบริการและการชำระค่าบริการ
“ผู้เช่า” ตกลงชำระเงินค่าเช่าให้แก่ “ผู้ให้เช่า” ในอัตราเดือนละ {ค่าเช่า} บาท ชำระ{รอบชำระ} งวดละ {ค่าเช่าต่องวด} บาท โดยจะชำระล่วงหน้าภายในวันที่ {ชำระภายในวันที่} ของเดือนที่ถึงกำหนดชำระ ตลอดระยะเวลาการเช่า กรณี “ผู้เช่า” ผิดนัดไม่ชำระภายในกำหนด “ผู้เช่า” ยินยอมชำระค่าปรับให้แก่ “ผู้ให้เช่า” ในอัตราวันละ {ค่าปรับชำระล่าช้า} บาท และหากไม่ชำระให้เสร็จสิ้นภายในวันที่ {ยึดคืนหลังวันที่} ของเดือน ผู้ให้เช่ามีสิทธิ์นำพื้นที่เช่าให้ผู้อื่นเช่า โดยผู้เช่าไม่มีสิทธิ์เรียกร้องใดๆ
เพื่อเป็นประกันในการที่ “ผู้เช่า” จะปฏิบัติตามสัญญานี้ “ผู้เช่า” ต้องวางเงินประกันสัญญาเช่าไว้กับ “ผู้ให้เช่า” ในวันทำสัญญานี้ จำนวน {เงินประกันกี่เดือน} เดือน เป็นจำนวนเงิน {เงินประกัน} บาท และวางเงินค่าเช่าล่วงหน้า {เดือนล่วงหน้า} เดือน เป็นจำนวนเงิน {ค่าเช่าล่วงหน้า} บาท
**รวมเป็นเงินชำระแรกเข้ารวม {ชำระแรกเข้ารวม} บาท**
อนึ่ง ผู้เช่าตกลงชำระค่าบริการตามสัญญาฉบับนี้ โดยนำเข้าบัญชีธนาคาร {บัญชีธนาคาร}

## ข้อ 4 ข้อตกลงการใช้พื้นที่เช่าที่ให้บริการ
ผู้เช่าให้สัญญาแก่ผู้ให้เช่าว่าจะใช้พื้นที่เช่าให้สอดคล้องและเป็นไปตามข้อตกลงที่ให้บริการ ดังต่อไปนี้
(ก) ผู้ให้เช่าจะไม่รับผิดชอบต่อทรัพย์สินของผู้เช่าทุกกรณี รวมถึงความเสียหายจากภัยธรรมชาติทุกกรณี
(ข) ผู้เช่าจะใช้ประโยชน์ในพื้นที่เช่าด้วยความสงบเรียบร้อย ไม่กระทำการใดหรือยินยอมให้บุคคลอื่นกระทำการใด ภายในหรือเกี่ยวเนื่องกับพื้นที่เช่าอันเป็นหรืออาจเป็นการขัดต่อกฎหมาย หรือขัดต่อศีลธรรมอันดีของประชาชน หรือโดยเป็นหรืออาจเป็นเหตุให้เกิดอันตรายต่อสุขภาพ อนามัยหรือเป็นสิ่งที่น่ารังเกียจ หรือก่อให้เกิดความเดือดร้อนรำคาญให้แก่ผู้ให้เช่าหรือบุคคลอื่นใดที่อยู่ภายในและ/หรือรอบข้างใกล้เคียง
(ค) ผู้เช่าจะไม่นำสิ่งของใดๆ อาวุธ วัตถุระเบิด สิ่งมีชีวิต ของเน่าเสีย เงินสด หลักทรัพย์ และยาเสพติดอันอาจก่อให้เกิดความเสียหายหรือมลภาวะต่อสถานที่ให้เช่าและ/หรืออันอาจเป็นอันตรายต่อบุคคลอื่น ทั้งในพื้นที่และรอบข้าง อันรวมถึงแต่ไม่จำกัดเพียง วัตถุไวไฟ วัตถุอันตราย สารกัมมันตภาพรังสี วัตถุที่มีน้ำหนักมากอันอาจมีผลกระทบต่อโครงสร้าง
(ง) ผู้ให้เช่ามีสิทธิว่ากล่าวตักเตือนและ/หรือร้องขอ ตามเห็นสมควรว่าจะเกิดความเสียหายต่อส่วนรวมนอกเหนือจากที่ระบุไว้ในหนังสือสัญญา และผู้เช่ายินดีที่จะต้องเชื่อฟังและปฏิบัติตาม
(จ) ผู้ให้เช่าไม่อนุญาตให้ผู้เช่านำสิทธิ์การเช่าไปปล่อยเช่าช่วงต่อ และ/หรือโอนสิทธิ์ให้ผู้อื่น
(ฉ) กรณีผู้เช่าไม่ประสงค์ที่จะเช่าต่อ จะต้องแจ้งให้ทราบล่วงหน้าอย่างน้อย 30 วัน
(ช) กรณีผู้เช่าประสงค์ยกเลิกสัญญาก่อนกำหนด ทางผู้ให้เช่าขอสงวนสิทธิ์คืนหรือแบ่งคืนค่าเช่า

## ข้อ 5 การสิ้นสุดสัญญา
ผู้เช่าต้องคืนพื้นที่ภายในวันที่ {วันสิ้นสุดสัญญา} ไม่เกิน 12.00 น.
สัญญาฉบับนี้จะถือว่าสิ้นสุดลงในกรณีใดกรณีหนึ่ง ดังต่อไปนี้
(ก) คู่สัญญาฝ่ายใดฝ่ายหนึ่งแจ้งเป็นลายลักษณ์อักษรให้คู่สัญญาอีกฝ่ายหนึ่งทราบถึงความประสงค์ที่จะเลิกใช้บริการหรือเลิกให้บริการตามสัญญาฉบับนี้ แล้วแต่กรณี
(ข) ในกรณีที่คู่สัญญาฝ่ายใดฝ่ายหนึ่งทำผิดข้อตกลงตามสัญญาฉบับนี้ และคู่สัญญาฝ่ายที่ไม่ผิดข้อตกลงนั้นได้ใช้สิทธิบอกเลิกสัญญาโดยแจ้งให้อีกฝ่ายรับทราบ
(ค) กรณีเกิดเหตุสุดวิสัย อันเป็นเหตุให้ผู้ให้เช่าไม่สามารถให้บริการผู้เช่าได้ตามวัตถุประสงค์แห่งสัญญาเช่าฉบับนี้

## ข้อ 6 ผลการสิ้นสุดสัญญา
เมื่อสัญญาฉบับนี้สิ้นสุดลงไม่ว่ากรณีใดๆ ผู้เช่าตกลงจะ
(ก) นำยานพาหนะ ทรัพย์สิน สิ่งของและสัมภาระใดๆ ของผู้เช่า ออกไปจาก${place}ทันที
(ข) ในกรณีที่ผู้เช่าไม่ปฏิบัติตามความในวรรคก่อน ผู้เช่ายินยอมและตกลงให้ผู้ให้เช่ากระทำการ
- เรียกเก็บค่าปรับรายวันจากผู้เช่าในอัตราวันละ {ค่าปรับหลังหมดสัญญา} บาท หรือ
- เคลื่อนย้าย นำออกไปจาก${place}ซึ่งยานพาหนะ ทรัพย์สิน สิ่งของและสัมภาระดังกล่าว
(ค) ในกรณีที่ผู้เช่าติดค้างชำระค่าบริการตามสัญญาฉบับนี้ ไม่ว่าทั้งหมดหรือบางส่วน ผู้ให้เช่ามีสิทธิ์ยึดหน่วงทรัพย์สิน ล็อค${place} ยึด${place}คืน รวมถึงสิ่งของและสัมภาระใดๆ ที่ผู้เช่านำมาไว้ภายใน${place}นั้นจนกว่าจะได้รับเงินค่าบริการครบตามสัญญาถ้วน

หนังสือสัญญาฉบับนี้ คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจข้อตกลงต่างๆ แห่งสัญญานี้โดยละเอียดดีแล้ว เห็นว่าถูกต้องตามเจตนาทุกประการ เพื่อเป็นหลักฐานจึงลงลายมือชื่อไว้เป็นสำคัญ และได้รับไว้ฝ่ายละ 1 ฉบับ โดยมีสรุปสาระสำคัญดังนี้

## สรุปสาระสำคัญของสัญญา
(1) หากผู้เช่าไม่ประสงค์ต่อสัญญาหรือยกเลิกสัญญา จะต้องแจ้งให้ทราบทางไลน์ล่วงหน้าอย่างน้อย 30 วัน
(2) ความหมายของเงินประกัน คือ การประกันการเช่าจนครบสัญญา หากยกเลิกก่อนหมดสัญญา จะไม่ได้รับเงินประกันคืน และหากมีความเสียหายที่เกินวงเงินประกัน ค่าใช้จ่ายส่วนเกินผู้เช่าจะเป็นผู้รับผิดชอบในการคืนสภาพพื้นที่เช่าทั้งหมด
(3) ไม่อนุญาตให้ปล่อยเช่าช่วง และ/หรือ โอนสิทธิ์
(4) ผู้ให้เช่าเป็นเพียงผู้ให้เช่าพื้นที่ ไม่ใช่บริการรับฝาก จึงไม่อาจรับผิดชอบต่อรถและทรัพย์สินของผู้เช่าทุกกรณี แต่ยินดีช่วยเปิดบันทึก CCTV ย้อนหลังให้ หากทรัพย์สินมีความเสียหาย
(5) หากหมดสัญญา แล้วผู้เช่าไม่นำยานพาหนะ และ/หรือทรัพย์สินออกจากพื้นที่เช่า จะมีค่าปรับวันละ {ค่าปรับหลังหมดสัญญา} บาท`;
}

function preamble(title: string) {
  return `# ${title}
สัญญาทำที่ “{ชื่อสาขา}” วันที่ {วันที่ทำสัญญา}

หนังสือนี้ทำขึ้นเพื่อเป็นหลักฐานแสดงว่า {ชื่อผู้ให้เช่า} ซึ่งต่อไปนี้จะเรียกว่า “ผู้ให้เช่า” ฝ่ายหนึ่ง ได้ตกลงทำสัญญากับ {ชื่อผู้เช่า} เบอร์โทร {เบอร์ผู้เช่า} ที่อยู่เลขที่ {ที่อยู่ผู้เช่า} ซึ่งต่อไปนี้จะเรียกว่า “ผู้เช่า” อีกฝ่ายหนึ่ง ทั้งสองฝ่ายตกลงทำหนังสือสัญญาฉบับนี้ โดยมีข้อความต่อไปนี้
`;
}

export const DEFAULT_TEMPLATE_STORAGE = `${preamble("สัญญาเช่าห้องเก็บของ")}
## ข้อ 1 พื้นที่ให้บริการ
ผู้ให้เช่าตกลงให้เช่าและผู้เช่าตกลงเช่าห้องเก็บของ ซึ่งตั้งอยู่ {ที่อยู่สาขา} จำนวน {จำนวนห้อง} ห้อง แบบห้องส่วนตัว หมายเลข {เลขห้อง} ซึ่งต่อไปนี้จะเรียกว่า “ห้องเก็บของ” เพื่อใช้เก็บ {สิ่งของที่เก็บ}

## ข้อ 2 ระยะเวลาการให้บริการ
ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่า ตั้งแต่วันที่ {วันเริ่มสัญญา} ถึงวันที่ {วันสิ้นสุดสัญญา} รวม {ระยะเวลาเช่า} ซึ่งต่อไปนี้จะเรียกว่า “ระยะเวลาการให้บริการ”

${commonClauses("ห้องเก็บของ")}`;

export const DEFAULT_TEMPLATE_PARKING = `${preamble("สัญญาเช่าที่จอดรถ")}
## ข้อ 1 พื้นที่ให้บริการ
ผู้ให้เช่าตกลงให้เช่าและผู้เช่าตกลงเช่าที่จอดรถ ซึ่งตั้งอยู่ {ที่อยู่สาขา} จำนวน {จำนวนห้อง} ช่อง หมายเลข {เลขห้อง} ซึ่งต่อไปนี้จะเรียกว่า “ที่จอดรถ” เพื่อใช้จอดรถทะเบียน {ทะเบียนรถ}

## ข้อ 2 ระยะเวลาการให้บริการ
ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่า ตั้งแต่วันที่ {วันเริ่มสัญญา} ถึงวันที่ {วันสิ้นสุดสัญญา} รวม {ระยะเวลาเช่า} ซึ่งต่อไปนี้จะเรียกว่า “ระยะเวลาการให้บริการ”

${commonClauses("ที่จอดรถ")}`;

export function defaultTemplate(kind: UnitKind) {
  return kind === "parking" ? DEFAULT_TEMPLATE_PARKING : DEFAULT_TEMPLATE_STORAGE;
}

export function templateFor(s: Settings, kind: UnitKind) {
  const custom = kind === "parking" ? s.contract_template_parking : s.contract_template_storage;
  return custom?.trim() ? custom : defaultTemplate(kind);
}

// ---------------------------------------------------------------------
// แปลงแม่แบบเป็นบล็อกสำหรับแสดงผล
// ---------------------------------------------------------------------

export type Inline =
  | { t: "text"; v: string; bold: boolean }
  | { t: "field"; key: string; v: string | null; bold: boolean };

export type Block =
  | { kind: "title"; parts: Inline[] }
  | { kind: "heading"; parts: Inline[] }
  | { kind: "item"; parts: Inline[] }
  | { kind: "para"; parts: Inline[] }
  | { kind: "gap" };

const FIELD_RE = /\{([^{}\n]{1,40})\}/g;

function parseInline(line: string, fields: Record<string, string>): Inline[] {
  const out: Inline[] = [];
  line.split("**").forEach((seg, i) => {
    const bold = i % 2 === 1;
    let last = 0;
    for (const m of seg.matchAll(FIELD_RE)) {
      if (m.index > last) out.push({ t: "text", v: seg.slice(last, m.index), bold });
      const key = m[1].trim();
      out.push({ t: "field", key, v: key in fields ? fields[key] : null, bold });
      last = m.index + m[0].length;
    }
    if (last < seg.length) out.push({ t: "text", v: seg.slice(last), bold });
  });
  return out;
}

export function parseTemplate(template: string, fields: Record<string, string>): Block[] {
  const blocks: Block[] = [];
  for (const raw of template.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (blocks.length && blocks[blocks.length - 1].kind !== "gap") blocks.push({ kind: "gap" });
      continue;
    }
    if (line.startsWith("## ")) blocks.push({ kind: "heading", parts: parseInline(line.slice(3).trim(), fields) });
    else if (line.startsWith("# ")) blocks.push({ kind: "title", parts: parseInline(line.slice(2).trim(), fields) });
    else if (/^(\(.{1,4}\)|-|\d{1,2}[.)])\s/.test(line)) blocks.push({ kind: "item", parts: parseInline(line, fields) });
    else blocks.push({ kind: "para", parts: parseInline(line, fields) });
  }
  return blocks;
}

/** ชื่อช่องที่ระบบไม่รู้จัก (พิมพ์ผิด) เพื่อเตือนในหน้าแก้แม่แบบ */
export function unknownFields(template: string) {
  const bad = new Set<string>();
  for (const m of template.matchAll(FIELD_RE)) {
    const key = m[1].trim();
    if (!ALL_FIELDS.has(key)) bad.add(key);
  }
  return [...bad];
}
