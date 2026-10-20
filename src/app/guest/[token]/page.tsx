import LinkGate from "@/components/LinkGate";

export const dynamic = "force-dynamic";

export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <LinkGate
      token={token}
      role="guest"
      title="Welcome"
      events={[
        { value: "guest_arrival_scan", label: "Arrival: condition on check-in" },
        { value: "guest_checkout_scan", label: "Checkout: condition on departure" },
      ]}
    />
  );
}
