"use client";

import { Check, Loader2 } from "lucide-react";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import type { ActionState, ServerAction } from "@/lib/action-state";
import { button, type ButtonSize, type ButtonVariant } from "./styles";

const PendingContext = createContext(false);
export const usePending = () => useContext(PendingContext);

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="col-span-full mt-3 rounded-lg border border-flag/40 bg-flag/10 px-3 py-2 text-sm text-flag">
        {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p role="status" className="col-span-full mt-3 flex items-center gap-2 text-sm text-mint">
        <Check className="size-4" aria-hidden="true" />
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * A form that runs a server action and shows its result inline. It submits through
 * startTransition so a failed submit keeps what the person typed (React would otherwise reset the form).
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
}: {
  action: ServerAction;
  children: ReactNode | ((ctx: { state: ActionState; pending: boolean }) => ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent).submitter;
          const data = new FormData(e.currentTarget, submitter);
          startTransition(() => formAction(data));
        }}
      >
        {typeof children === "function" ? children({ state, pending }) : children}
        <FormMessage state={state} />
      </form>
    </PendingContext.Provider>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className = "",
  name,
  value,
  confirm,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  name?: string;
  value?: string;
  /** Ask before submitting, for destructive actions. */
  confirm?: string;
}) {
  const pending = usePending();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
      className={`${button(variant, size)} ${className}`}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
