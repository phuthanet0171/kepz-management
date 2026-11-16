"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ownerOnlyError } from "./auth";
import { thaiError } from "./errors";
import { reqStr } from "./form";
import { createAdminClient, isAdminConfigured } from "./supabase/admin";
import { createClient } from "./supabase/server";
import type { ActionState } from "./types";

/** ลบไฟล์สลิปที่ไม่มีข้อมูลอ้างอิงแล้ว (ต้องมี secret key; ถ้าไม่มีไฟล์จะค้างอยู่ใน storage แต่ไม่มีใครเปิดได้) */
async function removeSlips(paths: string[] | null) {
  if (!paths?.length || !isAdminConfigured) return;
  await createAdminClient().storage.from("slips").remove(paths);
}

export async function purgeTenant(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const id = reqStr(fd, "id");
  const confirm = reqStr(fd, "confirm_name");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purge_tenant", { p_tenant_id: id, p_confirm_name: confirm });
  if (error) return { error: thaiError(error, "ลบผู้เช่าไม่สำเร็จ") };
  await removeSlips(data as string[] | null);

  revalidatePath("/", "layout");
  redirect("/tenants");
}

export async function purgeBranch(_: ActionState, fd: FormData): Promise<ActionState> {
  const denied = await ownerOnlyError();
  if (denied) return { error: denied };
  const id = reqStr(fd, "id");
  const confirm = reqStr(fd, "confirm_name");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purge_branch", { p_branch_id: id, p_confirm_name: confirm });
  if (error) return { error: thaiError(error, "ลบสาขาไม่สำเร็จ") };
  await removeSlips(data as string[] | null);

  revalidatePath("/", "layout");
  redirect("/branches");
}
