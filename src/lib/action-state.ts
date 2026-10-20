/** Result shape returned by dashboard server actions and rendered by ActionForm. */
export interface ActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  link?: { url: string; role: "guest" | "crew"; notBefore: string; expiresAt: string; zone: string };
  chain?: { intact: boolean; checked: number; brokenSeq: number | null; reason: string | null };
}

export type ActionState = ActionResult | null;
export type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
