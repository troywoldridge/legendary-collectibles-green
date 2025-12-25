import BatchClient from "@/app/admin/inventory/intake/[batchId]/BatchClient";

export default async function BatchPage(
  props: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await props.params;
  return <BatchClient batchId={batchId} />;
}
