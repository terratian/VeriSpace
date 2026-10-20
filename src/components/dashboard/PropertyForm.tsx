"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { ServerAction } from "@/lib/action-state";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { field, fieldLabel } from "@/components/ui/styles";
import { COMMON_TIME_ZONES, isValidTimeZone } from "@/lib/time";

export function PropertyForm({
  action,
  submitLabel,
  propertyId,
  initial,
}: {
  action: ServerAction;
  submitLabel: string;
  propertyId?: string;
  initial?: { name: string; address: string | null; timezone: string };
}) {
  const uid = useId();
  const [tz, setTz] = useState(initial?.timezone ?? "America/New_York");
  const [detected, setDetected] = useState<string | null>(null);

  // New properties default to the manager's own zone, which is usually the property's.
  useEffect(() => {
    if (initial) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && isValidTimeZone(zone)) {
      setDetected(zone);
      setTz(zone);
    }
  }, [initial]);

  const options = useMemo(() => {
    const list = [...COMMON_TIME_ZONES];
    for (const extra of [detected, initial?.timezone]) {
      if (extra && !list.some((z) => z.value === extra)) list.unshift({ value: extra, label: extra.replace(/_/g, " ") });
    }
    return list;
  }, [detected, initial?.timezone]);

  return (
    <ActionForm action={action} resetOnSuccess={!initial} className="grid gap-4 sm:grid-cols-2">
      {propertyId && <input type="hidden" name="propertyId" value={propertyId} />}
      <div>
        <label htmlFor={`${uid}-name`} className={fieldLabel}>
          Property name
        </label>
        <input id={`${uid}-name`} name="name" required maxLength={120} defaultValue={initial?.name} placeholder="Lakeside cottage" className={field} />
      </div>
      <div>
        <label htmlFor={`${uid}-tz`} className={fieldLabel}>
          Time zone
        </label>
        <select id={`${uid}-tz`} name="timezone" value={tz} onChange={(e) => setTz(e.target.value)} className={field}>
          {options.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${uid}-address`} className={fieldLabel}>
          Address (optional)
        </label>
        <input id={`${uid}-address`} name="address" maxLength={240} defaultValue={initial?.address ?? ""} placeholder="12 Shore Road, Burlington, NC" className={field} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
