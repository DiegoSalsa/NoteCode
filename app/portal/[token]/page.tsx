import ClientPortal from "@/components/ClientPortal";

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  return <ClientPortal token={token} preview={query.preview === "1"} />;
}
