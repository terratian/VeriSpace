import type { Metadata } from "next";
import LinkGate from "@/components/LinkGate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Turnover checklist", robots: { index: false, follow: false } };

export default async function CrewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <LinkGate token={token} role="crew" />;
}
