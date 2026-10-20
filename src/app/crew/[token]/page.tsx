import LinkGate from "@/components/LinkGate";

export const dynamic = "force-dynamic";

export default async function CrewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <LinkGate
      token={token}
      role="crew"
      title="Turnover checklist"
      events={[
        { value: "clean_start", label: "Started cleaning" },
        { value: "photo_verified", label: "Verified photo" },
        { value: "restock", label: "Restocked" },
        { value: "damage_report", label: "Damage found" },
        { value: "clean_end", label: "Finished cleaning" },
      ]}
    />
  );
}
