export const runtime = "nodejs";
export default function EbayDeclined() {
  return (
    <main className="prose prose-invert max-w-xl">
      <h1>eBay Sign-in Canceled</h1>
      <p>No problem — nothing was connected.</p>
      <p>
        You can try again from your account settings or{" "}
        <a className="underline" href="/api/ebay/authorize">start eBay sign-in</a>.
      </p>
    </main>
  );
}
