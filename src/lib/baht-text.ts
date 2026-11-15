const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** อ่านจำนวนเต็มบวกไม่เกิน 6 หลัก */
function readGroup(n: string): string {
  n = n.replace(/^0+/, "");
  let out = "";
  const len = n.length;
  for (let i = 0; i < len; i++) {
    const d = Number(n[i]);
    const place = len - i - 1;
    if (d === 0) continue;
    if (place === 0 && d === 1 && len > 1) out += "เอ็ด";
    else if (place === 1 && d === 2) out += "ยี่";
    else if (place === 1 && d === 1) out += "";
    else out += DIGITS[d];
    out += PLACES[place];
  }
  return out;
}

function readInteger(n: string): string {
  n = n.replace(/^0+/, "");
  if (n === "") return "";
  if (n.length <= 6) return readGroup(n);
  const head = n.slice(0, n.length - 6);
  const tail = n.slice(-6);
  return readInteger(head) + "ล้าน" + readGroup(tail);
}

/** แปลงจำนวนเงินเป็นคำอ่านภาษาไทย เช่น 1250.50 → "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์" */
export function bahtText(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const negative = amount < 0;
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split(".");
  const baht = readInteger(intPart);
  const satang = readInteger(decPart);
  let text = "";
  if (baht) text += `${baht}บาท`;
  if (satang) text += `${satang}สตางค์`;
  else text += baht ? "ถ้วน" : "ศูนย์บาทถ้วน";
  return negative ? `ลบ${text}` : text;
}
