"use client";

import clsx from "clsx";
import { signalNavigation } from "@/components/shell/nav-pending";
import { X } from "lucide-react";
import {
  createContext,
  startTransition,
  useCallback,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal, useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/types";

const PendingContext = createContext(false);

export function SubmitButton({
  children,
  pendingText = "กำลังบันทึก…",
  className = "btn btn-primary",
  name,
  value,
  formNoValidate,
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
  formNoValidate?: boolean;
  disabled?: boolean;
}) {
  const status = useFormStatus();
  const pending = useContext(PendingContext) || status.pending;
  return (
    <button type="submit" className={className} disabled={pending || disabled} name={name} value={value} formNoValidate={formNoValidate}>
      {pending ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-current/25 border-t-current in-[.btn-primary]:border-t-brand" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function FormError({ state }: { state: ActionState }) {
  if (!state?.error) return null;
  return (
    <div role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">
      {state.error}
    </div>
  );
}

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** ข้อความเตือนภาษาไทยของช่องที่กรอกไม่ถูก (ใช้ชื่อช่องจาก label) */
function invalidMessage(el: Control) {
  const raw = el.closest("label")?.querySelector(".label")?.textContent ?? el.getAttribute("aria-label") ?? "";
  const name = raw.replace(/\*/g, "").trim();
  const v = el.validity;
  const choose = el.tagName === "SELECT" || (el as HTMLInputElement).type === "checkbox" || (el as HTMLInputElement).type === "radio";
  if (v.valueMissing) {
    const verb = choose ? "เลือก" : "กรอก";
    // ชื่อช่องที่ขึ้นต้นด้วยคำกริยาอยู่แล้ว เช่น "เลือกผู้เช่า" ไม่ต้องเติมซ้ำ
    const what = name.replace(/^(เลือก|กรอก|ระบุ)/, "");
    return what ? `กรุณา${verb}${what}` : `กรุณา${verb}ช่องนี้`;
  }
  if (v.badInput) return "กรุณากรอกเป็นตัวเลข";
  if (v.rangeUnderflow) return `${name || "ค่านี้"}ต้องไม่น้อยกว่า ${(el as HTMLInputElement).min}`;
  if (v.rangeOverflow) return `${name || "ค่านี้"}ต้องไม่เกิน ${(el as HTMLInputElement).max}`;
  if (v.stepMismatch) return "ตัวเลขไม่ถูกต้อง (ทศนิยมได้ไม่เกิน 2 ตำแหน่ง)";
  if (v.typeMismatch) return (el as HTMLInputElement).type === "email" ? "รูปแบบอีเมลไม่ถูกต้อง" : "รูปแบบไม่ถูกต้อง";
  if (v.tooLong) return `ยาวเกิน ${(el as HTMLInputElement).maxLength} ตัวอักษร`;
  if (v.tooShort) return `สั้นเกินไป ต้องมีอย่างน้อย ${(el as HTMLInputElement).minLength} ตัวอักษร`;
  if (v.patternMismatch) return "รูปแบบไม่ถูกต้อง";
  return el.validationMessage;
}

/** ทำเครื่องหมายช่องที่ผิดด้วยกรอบแดงและข้อความใต้ช่อง */
function markInvalid(el: Control) {
  el.setAttribute("aria-invalid", "true");
  let msg = el.nextElementSibling as HTMLElement | null;
  if (!msg?.hasAttribute("data-field-error")) {
    msg = document.createElement("span");
    msg.setAttribute("data-field-error", "");
    msg.setAttribute("role", "alert");
    msg.className = "mt-1 block text-xs font-medium text-bad";
    el.insertAdjacentElement("afterend", msg);
  }
  msg.textContent = invalidMessage(el);
}

function clearInvalid(el: Control) {
  if (el.getAttribute("aria-invalid") !== "true" || !el.checkValidity()) return;
  el.removeAttribute("aria-invalid");
  const msg = el.nextElementSibling;
  if (msg?.hasAttribute("data-field-error")) msg.remove();
}

/**
 * ฟอร์มที่เรียก Server Action และแสดงข้อผิดพลาดภาษาไทย
 * ถ้า action สำเร็จและคืนค่า ok จะเรียก onSuccess (เช่น ปิดหน้าต่าง)
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  encType,
  resetOnSuccess = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  onSuccess?: (state: NonNullable<ActionState>) => void;
  encType?: "multipart/form-data";
  /** ล้างฟอร์มหลังบันทึกสำเร็จ (ปิดสำหรับฟอร์มแก้ไขที่ต้องการคงค่าที่บันทึกไว้) */
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstInvalid = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccessRef.current?.(state);
    } else if (state?.error) {
      // ข้อความผิดพลาดอยู่บนสุดของฟอร์ม เลื่อนให้เห็นเสมอ (เช่น ในหน้าต่างที่เลื่อนลงมาถึงปุ่มบันทึก)
      formRef.current?.querySelector('[role="alert"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      className={clsx("space-y-4", className)}
      encType={encType}
      // ลืมกรอกช่องที่บังคับ: เลื่อนไปที่ช่องแรกที่ยังไม่ครบ ขึ้นกรอบแดงและข้อความบอกว่าต้องกรอกอะไร
      onInvalidCapture={(e) => {
        e.preventDefault();
        const el = e.target as unknown as Control;
        markInvalid(el);
        if (firstInvalid.current) return;
        firstInvalid.current = true;
        setTimeout(() => (firstInvalid.current = false), 0);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => el.focus({ preventScroll: true }), 350);
      }}
      onInputCapture={(e) => clearInvalid(e.target as unknown as Control)}
      onChangeCapture={(e) => clearInvalid(e.target as unknown as Control)}
      // ส่งผ่าน onSubmit แทน action={...} เพื่อไม่ให้ React ล้างค่าที่กรอกไว้เมื่อบันทึกไม่สำเร็จ
      onSubmit={(e) => {
        // ไม่รับ submit ของฟอร์มอื่นที่ส่งต่อขึ้นมา (เช่น ฟอร์มในหน้าต่าง Sheet ที่อยู่ในฟอร์มนี้)
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (pending) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>
      <FormError state={state} />
      {state?.ok && state.message && (
        <div role="status" className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm text-ok">
          {state.message}
        </div>
      )}
      {children}
      </PendingContext.Provider>
    </form>
  );
}

const noopSubscribe = () => () => {};

/** หน้าต่างแบบ bottom sheet บนมือถือ และ modal กลางจอบนคอมพิวเตอร์ */
export function Sheet({
  trigger,
  triggerClassName = "btn btn-outline",
  title,
  description,
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  title: ReactNode;
  description?: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => dialog?.close(), [dialog]);
  // วางหน้าต่างไว้ที่ <body> เสมอ ไม่ให้ฟอร์มในหน้าต่างไปซ้อนในฟอร์มของหน้า (ฟอร์มซ้อนกันจะส่งข้อมูลไม่ได้)
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => {
          setOpen(true);
          dialog?.showModal();
        }}
      >
        {trigger}
      </button>
      {mounted &&
        createPortal(
          <dialog
            ref={setDialog}
            onClose={() => setOpen(false)}
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
            className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-surface p-0 text-ink shadow-2xl sm:m-auto sm:max-w-lg sm:rounded-3xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b-2 border-brand bg-surface px-5 pt-5 pb-3 sm:pt-4">
              {/* แถบจับด้านบนของหน้าต่างบนมือถือ */}
              <span aria-hidden className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line sm:hidden" />
              <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
              </div>
              <button type="button" onClick={close} className="btn btn-ghost -mr-2 size-10 min-h-0 rounded-full p-0" aria-label="ปิด">
                <X className="size-5" />
              </button>
            </div>
            <div className="safe-bottom px-5 pt-4 pb-6">{open && children(close)}</div>
          </dialog>,
          document.body,
        )}
    </>
  );
}

/** แถวตารางที่คลิกตรงไหนก็เปิดหน้ารายละเอียด (ลิงก์/ปุ่มในแถวยังทำงานตามปกติ, Ctrl/⌘+คลิกเปิดแท็บใหม่) */
export function RowLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr
      className={clsx("cursor-pointer", className)}
      onClick={(e) => {
        if (!e.currentTarget.contains(e.target as Node)) return; // คลิกในหน้าต่าง Sheet (อยู่นอกแถวจริง)
        if ((e.target as HTMLElement).closest("a, button, input, select, textarea, label")) return;
        if (window.getSelection()?.toString()) return; // กำลังลากเลือกข้อความ
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else {
          signalNavigation();
          router.push(href);
        }
      }}
      onMouseEnter={() => router.prefetch(href)}
    >
      {children}
    </tr>
  );
}
