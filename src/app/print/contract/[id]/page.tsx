import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { bahtText } from "@/lib/baht-text";
import { getSettings } from "@/lib/data";
import { BILLING_CYCLE_LABEL, BILLING_CYCLE_MONTHS, money, thDateLong } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ContractView, Tenant } from "@/lib/types";
import { DocHeader, Paper, Signatures } from "../../doc";

export const metadata: Metadata = { title: "สัญญาเช่า" };

export default async function PrintContractPage({ params }: PageProps<"/print/contract/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: cData }, settings] = await Promise.all([
    supabase.from("v_contracts").select("*").eq("id", id).maybeSingle(),
    getSettings(),
  ]);
  if (!cData) notFound();
  const c = cData as ContractView;
  const { data: tenantData } = await supabase.from("tenants").select("*").eq("id", c.tenant_id).single();
  const t = tenantData as Tenant;
  const { data: unitType } = await supabase.from("unit_types").select("size_label").eq("code", c.unit_type_code).single();

  const terms = (settings.contract_terms ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const perCycle = Number(c.monthly_rent) * BILLING_CYCLE_MONTHS[c.billing_cycle];

  return (
    <Paper title={`สัญญาเช่า ${c.contract_no}`}>
      <DocHeader
        settings={settings}
        title="สัญญาเช่าพื้นที่"
        subtitle="RENTAL AGREEMENT"
        meta={[
          { label: "เลขที่", value: c.contract_no },
          { label: "ทำที่", value: c.branch_name },
          { label: "วันที่", value: thDateLong(c.start_date) },
        ]}
      />

      <section className="space-y-3">
        <p>
          สัญญาฉบับนี้ทำขึ้นระหว่าง <b>{settings.business_name}</b>
          {settings.business_address && <> ที่อยู่ {settings.business_address.replace(/\s*\n\s*/g, " ")}</>} ซึ่งต่อไปในสัญญานี้เรียกว่า
          “ผู้ให้เช่า” ฝ่ายหนึ่ง กับ
        </p>
        <p>
          <b>{t.full_name}</b>
          {t.id_number && (
            <>
              {" "}
              {t.tenant_type === "company" ? "เลขประจำตัวผู้เสียภาษี" : "เลขประจำตัวประชาชน"} {t.id_number}
            </>
          )}
          {t.address && <> ที่อยู่ {t.address.replace(/\s*\n\s*/g, " ")}</>} โทร {t.phone} ซึ่งต่อไปในสัญญานี้เรียกว่า “ผู้เช่า”
          อีกฝ่ายหนึ่ง
        </p>
        <p>ทั้งสองฝ่ายตกลงทำสัญญากันดังมีข้อความต่อไปนี้</p>
      </section>

      <table className="my-5 w-full border-collapse">
        <tbody className="[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2">
          <tr>
            <td className="w-48 bg-canvas font-medium print:bg-transparent">พื้นที่เช่า</td>
            <td>
              {c.unit_type_name} รหัส <b>{c.unit_code}</b> สาขา {c.branch_name}
              {unitType?.size_label && <> ขนาด {unitType.size_label}</>}
            </td>
          </tr>
          <tr>
            <td className="bg-canvas font-medium print:bg-transparent">ระยะเวลาเช่า</td>
            <td>
              ตั้งแต่ {thDateLong(c.start_date)} ถึง {thDateLong(c.end_date)}
            </td>
          </tr>
          <tr>
            <td className="bg-canvas font-medium print:bg-transparent">ค่าเช่า</td>
            <td>
              เดือนละ {money(c.monthly_rent)} บาท ({bahtText(Number(c.monthly_rent))})
            </td>
          </tr>
          <tr>
            <td className="bg-canvas font-medium print:bg-transparent">การชำระค่าเช่า</td>
            <td>
              ชำระ{BILLING_CYCLE_LABEL[c.billing_cycle]} งวดละ {money(perCycle)} บาท
            </td>
          </tr>
          <tr>
            <td className="bg-canvas font-medium print:bg-transparent">เงินประกัน</td>
            <td>
              {Number(c.deposit_amount) > 0 ? `${money(c.deposit_amount)} บาท (${bahtText(Number(c.deposit_amount))})` : "ไม่มี"}
            </td>
          </tr>
          {c.note && (
            <tr>
              <td className="bg-canvas font-medium print:bg-transparent">เงื่อนไขเพิ่มเติม</td>
              <td className="whitespace-pre-line">{c.note}</td>
            </tr>
          )}
        </tbody>
      </table>

      {terms.length > 0 ? (
        <section>
          <h2 className="mb-2 font-semibold">ข้อกำหนดและเงื่อนไข</h2>
          <ol className="list-decimal space-y-1.5 pl-6">
            {terms.map((line, i) => (
              <li key={i}>{line.replace(/^\d+[.)]\s*/, "")}</li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="no-print rounded border border-dashed border-warn p-3 text-warn">
          ยังไม่ได้กำหนดข้อกำหนดและเงื่อนไขของสัญญา เพิ่มได้ที่ ตั้งค่า → เอกสาร (ข้อความนี้ไม่แสดงตอนพิมพ์)
        </p>
      )}

      <p className="mt-6">
        คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจข้อความในสัญญานี้โดยตลอดแล้ว จึงได้ลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน
      </p>

      <Signatures left="ผู้เช่า" right="ผู้ให้เช่า" />
      <Signatures left="พยาน" right="พยาน" />
    </Paper>
  );
}
