import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/ssr-server";
import { addProperty, addRoom } from "./actions";

export const dynamic = "force-dynamic";

interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  rooms: { id: string; name: string }[];
}

export default async function Dashboard() {
  const supabase = createSessionClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Row Level Security limits this to the signed-in owner's properties.
  const { data, error } = await supabase
    .from("properties")
    .select("id, name, address, rooms(id, name)")
    .order("created_at");
  if (error) throw new Error(error.message);
  const properties = (data ?? []) as PropertyRow[];

  const field = "rounded-lg border border-line bg-panel px-3 py-2 text-white";
  const button = "rounded-lg bg-mint px-4 py-2 font-bold text-obsidian";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-mint">VeriSpace</p>
          <h1 className="text-2xl font-black text-white">Your properties</h1>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-ash/70 underline">Sign out ({user.email})</button>
        </form>
      </header>

      <form action={addProperty} className="mb-10 flex flex-wrap gap-3">
        <input name="name" required maxLength={120} placeholder="Property name" className={field} />
        <input name="address" maxLength={240} placeholder="Address (optional)" className={`${field} flex-1`} />
        <button className={button}>Add property</button>
      </form>

      {properties.length === 0 && <p className="text-ash/70">No properties yet. Add your first one above.</p>}

      <div className="space-y-6">
        {properties.map((p) => (
          <section key={p.id} className="rounded-2xl border border-line bg-panel p-6">
            <h2 className="text-lg font-bold text-white">{p.name}</h2>
            {p.address && <p className="text-sm text-ash/70">{p.address}</p>}
            <ul className="my-4 list-inside list-disc text-sm">
              {p.rooms.length === 0 && <li className="list-none text-ash/60">No rooms yet</li>}
              {p.rooms.map((r) => <li key={r.id}>{r.name}</li>)}
            </ul>
            <form action={addRoom} className="flex gap-3">
              <input type="hidden" name="propertyId" value={p.id} />
              <input name="name" required maxLength={120} placeholder="Add a room (e.g. Living Room)" className={`${field} flex-1`} />
              <button className={button}>Add room</button>
            </form>
          </section>
        ))}
      </div>
    </main>
  );
}
