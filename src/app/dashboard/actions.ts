"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSessionClient } from "@/lib/supabase/ssr-server";

const propertySchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(240).optional(),
});
const roomSchema = z.object({ propertyId: z.guid(), name: z.string().trim().min(1).max(120) });

async function signedInClient() {
  const supabase = createSessionClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Row Level Security also enforces ownership; the owner_id here just sets it on insert. */
export async function addProperty(formData: FormData) {
  const input = propertySchema.parse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
  });
  const { supabase, user } = await signedInClient();
  const { error } = await supabase.from("properties").insert({ owner_id: user.id, ...input });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function addRoom(formData: FormData) {
  const input = roomSchema.parse({ propertyId: formData.get("propertyId"), name: formData.get("name") });
  const { supabase } = await signedInClient();
  const { error } = await supabase.from("rooms").insert({ property_id: input.propertyId, name: input.name });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}
