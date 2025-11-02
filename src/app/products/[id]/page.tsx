// src/app/products/[id]/page.tsx
export const dynamic = "force-dynamic";
type Params = { id: string };

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return (
    <section style={{ padding: 20 }}>
      <h1>Product #{id}</h1>
      <p>Stub product page. Hook up DB/details here.</p>
    </section>
  );
}
