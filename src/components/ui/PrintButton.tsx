"use client";

import { Printer } from "lucide-react";
import { button } from "./styles";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={button("secondary", "md")}>
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
