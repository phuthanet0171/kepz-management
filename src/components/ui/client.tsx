"use client";

import clsx from "clsx";
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
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/types";

const PendingContext = createContext(false);

export function SubmitButton({
  children,
  pendingText = "กำลังบันทึก…",
  className = "btn btn-primary",
  name,
  value,
  formNoValidate,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
  formNoValidate?: boolean;
}) {
  const status = useFormStatus();
  const pending = useContext(PendingContext) || status.pending;
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value} formNoValidate={formNoValidate}>
      {pending ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
  onSuccess?: () => void;
  encType?: "multipart/form-data";
  /** ล้างฟอร์มหลังบันทึกสำเร็จ (ปิดสำหรับฟอร์มแก้ไขที่ต้องการคงค่าที่บันทึกไว้) */
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccessRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      className={clsx("space-y-4", className)}
      encType={encType}
      // ส่งผ่าน onSubmit แทน action={...} เพื่อไม่ให้ React ล้างค่าที่กรอกไว้เมื่อบันทึกไม่สำเร็จ
      onSubmit={(e) => {
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
      <dialog
        ref={setDialog}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-surface p-0 text-ink shadow-2xl sm:m-auto sm:max-w-lg sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface px-5 pt-4 pb-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button type="button" onClick={close} className="btn btn-ghost -mr-2 size-10 min-h-0 rounded-full p-0" aria-label="ปิด">
            <X className="size-5" />
          </button>
        </div>
        <div className="safe-bottom px-5 pt-4 pb-6">{open && children(close)}</div>
      </dialog>
    </>
  );
}
