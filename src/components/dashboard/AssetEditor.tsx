"use client";

import { FileText, Link2, Loader2, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { addResource, deleteResource, deleteRoom, renameRoom, updateFeature } from "@/app/dashboard/resource-actions";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { button, field, fieldLabel } from "@/components/ui/styles";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { FEATURE_KINDS, FEATURE_LABELS, type FeatureKind } from "@/lib/model";
import { BUCKET, MAX_PDF_BYTES } from "@/lib/resources";

export interface OwnerResource {
  id: string;
  title: string;
  kind: "link" | "pdf";
  url: string | null;
}

/** Rename or remove a room. */
export function RoomEditor({ id, name }: { id: string; name: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <ActionForm action={renameRoom} resetOnSuccess={false} className="flex items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <input name="name" defaultValue={name} required maxLength={120} aria-label="Room name" className={`${field} w-48`} />
        <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
          Rename
        </SubmitButton>
      </ActionForm>
      <ActionForm action={deleteRoom} resetOnSuccess={false}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton variant="ghost" size="sm" pendingLabel="Removing…" confirm={`Remove "${name}" and its features?`}>
          <Trash2 className="size-4" aria-hidden="true" />
          <span className="sr-only">Remove {name}</span>
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

/** Edit one asset's details and the help guests get for it. */
export function AssetEditor({
  propertyId,
  roomId,
  feature,
  resources,
}: {
  propertyId: string;
  roomId: string;
  feature: { id: string; name: string; kind: FeatureKind; advertised: boolean; details: string };
  resources: OwnerResource[];
}) {
  const uid = useId();
  return (
    <details className="group mt-1">
      <summary className="cursor-pointer text-[13px] text-mint hover:underline">
        Edit and add guest help{resources.length > 0 ? ` (${resources.length})` : ""}
      </summary>
      <div className="mt-3 space-y-5 rounded-lg border border-edge p-4">
        <ActionForm action={updateFeature} resetOnSuccess={false} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={feature.id} />
          <div>
            <label htmlFor={`${uid}-n`} className={fieldLabel}>Name</label>
            <input id={`${uid}-n`} name="name" defaultValue={feature.name} required maxLength={80} className={field} />
          </div>
          <div>
            <label htmlFor={`${uid}-k`} className={fieldLabel}>Type</label>
            <select id={`${uid}-k`} name="kind" defaultValue={feature.kind} className={field}>
              {FEATURE_KINDS.map((k) => (
                <option key={k} value={k}>{FEATURE_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${uid}-d`} className={fieldLabel}>Details (brand, model, how it works)</label>
            <textarea id={`${uid}-d`} name="details" defaultValue={feature.details} maxLength={500} rows={2} className={field} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ash sm:col-span-2">
            <input type="checkbox" name="advertised" defaultChecked={feature.advertised} className="size-4 accent-mint" />
            Show to guests
          </label>
          <div className="sm:col-span-2">
            <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">Save changes</SubmitButton>
          </div>
        </ActionForm>
        <ResourceManager propertyId={propertyId} roomId={roomId} featureId={feature.id} resources={resources} />
      </div>
    </details>
  );
}

/** Product pages, manuals and PDFs guests can open. Attach to a room (featureId null) or to one asset. */
export function ResourceManager({
  propertyId,
  roomId,
  featureId,
  resources,
}: {
  propertyId: string;
  roomId: string;
  featureId: string | null;
  resources: OwnerResource[];
}) {
  const uid = useId();
  return (
    <div>
      <h3 className="text-sm font-semibold">Guest help</h3>
      <p className="mb-2 text-[13px] text-mute">Product pages, manuals and PDFs. Guests see these in this {featureId ? "asset" : "room"}.</p>
      {resources.length > 0 && (
        <ul className="mb-3 divide-y divide-edge border-y border-edge">
          {resources.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-ash">
                {r.kind === "pdf" ? <FileText className="size-4 shrink-0" aria-hidden="true" /> : <Link2 className="size-4 shrink-0" aria-hidden="true" />}
                <span className="truncate">{r.title}</span>
              </span>
              <ActionForm action={deleteResource} resetOnSuccess={false}>
                <input type="hidden" name="id" value={r.id} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="…" confirm={`Remove "${r.title}"?`}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="sr-only">Remove {r.title}</span>
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={addResource} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
        <input type="hidden" name="roomId" value={roomId} />
        <input type="hidden" name="featureId" value={featureId ?? ""} />
        <div>
          <label htmlFor={`${uid}-t`} className={fieldLabel}>Title</label>
          <input id={`${uid}-t`} name="title" required maxLength={80} placeholder="Hot tub guide" className={field} />
        </div>
        <div>
          <label htmlFor={`${uid}-u`} className={fieldLabel}>Web address</label>
          <input id={`${uid}-u`} name="url" type="url" required placeholder="https://" className={field} />
        </div>
        <SubmitButton variant="secondary" size="sm" pendingLabel="Adding…">Add link</SubmitButton>
      </ActionForm>
      <PdfUpload propertyId={propertyId} roomId={roomId} featureId={featureId} />
    </div>
  );
}

function PdfUpload({ propertyId, roomId, featureId }: { propertyId: string; roomId: string; featureId: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [state, setState] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) return setState({ tone: "error", text: "Choose a PDF first." });
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setState({ tone: "error", text: "That isn't a PDF." });
    if (file.size > MAX_PDF_BYTES) return setState({ tone: "error", text: "Keep PDFs under 15 MB." });
    setBusy(true);
    setState(null);
    const path = `${propertyId}/${crypto.randomUUID()}.pdf`;
    const { error } = await createBrowserSupabase().storage.from(BUCKET).upload(path, file, { contentType: "application/pdf" });
    if (error) {
      setBusy(false);
      return setState({ tone: "error", text: `Upload failed: ${error.message}. Has the room_resources migration been applied?` });
    }
    const fd = new FormData();
    fd.set("roomId", roomId);
    fd.set("featureId", featureId ?? "");
    fd.set("title", title.trim() || file.name.replace(/\.pdf$/i, "").slice(0, 80));
    fd.set("storagePath", path);
    const res = await addResource(null, fd);
    setBusy(false);
    if (res?.error) return setState({ tone: "error", text: res.error });
    setTitle("");
    if (input.current) input.current.value = "";
    setState({ tone: "ok", text: "PDF added" });
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <div>
        <label className={fieldLabel}>Upload a PDF</label>
        <input ref={input} type="file" accept="application/pdf" className="block text-sm text-ash file:mr-3 file:rounded-lg file:border file:border-edge file:bg-transparent file:px-3 file:py-2 file:text-ash" />
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={80} aria-label="PDF title" className={`${field} w-44`} />
      <button type="button" onClick={upload} disabled={busy} className={button("secondary", "sm")}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Upload
      </button>
      {state && (
        <p role={state.tone === "error" ? "alert" : "status"} className={`w-full text-sm ${state.tone === "error" ? "text-flag" : "text-mint"}`}>
          {state.text}
        </p>
      )}
    </div>
  );
}
