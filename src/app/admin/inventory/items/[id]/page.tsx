import ItemEditor from "./ui";

export default async function InventoryItemEditPage(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  return <ItemEditor id={id} />;
}
