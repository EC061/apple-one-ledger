"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  pending,
  className = "btn btn-primary",
  name,
  value,
  disabled,
  title,
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  title?: string;
}) {
  const status = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      name={name}
      value={value}
      disabled={disabled || status.pending}
      title={title}
      aria-busy={status.pending}
    >
      {status.pending ? pending ?? "Working…" : children}
    </button>
  );
}
