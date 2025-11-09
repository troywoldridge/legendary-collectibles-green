import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Privacy Policy • Legendary Collectibles",
  description:
    "How Legendary Collectibles collects, uses, and protects your information.",
};

export default function PrivacyPolicyPage() {
  const Effective = "2025-11-06"; // ← update when you publish
  return (
    <article className="prose prose-invert max-w-3xl">
      <h1>Privacy Policy</h1>
      <p><strong>Effective date:</strong> {Effective}</p>

      <p>
        Legendary Collectibles (“we”, “us”, “our”) operates the website
        <em> legendary-collectibles.com</em> (the “Site”). This Privacy Policy
        explains how we collect, use, disclose, and protect information when you
        visit our Site, create an account, browse products, or otherwise interact with us.
      </p>

      <h2>Information We Collect</h2>
      <ul>
        <li>
          <strong>Account &amp; Profile.</strong> Name, email address, optional display name.
        </li>
        <li>
          <strong>Orders &amp; Support.</strong> Shipping address, order contents, contact messages,
          and similar records needed to fulfill your order and provide support.
        </li>
        <li>
          <strong>Payments.</strong> We use third-party processors (e.g., Stripe). Card details are
          sent directly to the processor and are not stored on our servers. We retain payment
          status, amounts, and non-sensitive transaction metadata.
        </li>
        <li>
          <strong>Usage Data.</strong> IP address, device/browser info, pages viewed, and referral
          information collected via standard web logs and analytics (e.g., Cloudflare).
        </li>
        <li>
          <strong>Cookies.</strong> Session cookies (to keep you signed in), preferences, and basic
          analytics cookies. You can control cookies via your browser.
        </li>
      </ul>

      <h2>How We Use Information</h2>
      <ul>
        <li>Provide, operate, and improve the Site and services.</li>
        <li>Process and deliver orders; communicate about orders or support requests.</li>
        <li>Personalize content and product recommendations.</li>
        <li>Prevent fraud, secure the Site, and comply with legal obligations.</li>
        <li>Where permitted, send updates or marketing; you can opt out at any time.</li>
      </ul>

      <h2>Sharing &amp; Disclosures</h2>
      <p>
        We share information with service providers who help us run the Site and fulfill services,
        such as:
      </p>
      <ul>
        <li>
          <strong>Payments:</strong> Stripe (payment processing).
        </li>
        <li>
          <strong>Hosting &amp; Delivery:</strong> Cloudflare (Pages/Workers, Images, CDN), object storage/CDN,
          and database hosting providers.
        </li>
        <li>
          <strong>Analytics &amp; Logs:</strong> Cloudflare Web Analytics and server logs for security and
          performance.
        </li>
        <li>
          <strong>Optional Market Integrations:</strong> If you connect external marketplaces (e.g., eBay OAuth),
          we store tokens necessary to provide that feature; you can revoke them at any time.
        </li>
      </ul>
      <p>
        We do not sell your personal information. We may disclose information if required by law or
        to protect our rights, users, or the public.
      </p>

      <h2>Data Retention</h2>
      <p>
        We retain information as long as needed to provide services, comply with legal obligations,
        resolve disputes, and enforce agreements. You may request deletion of your account where applicable.
      </p>

      <h2>Your Rights</h2>
      <ul>
        <li>
          <strong>Access / Correction.</strong> You can access or correct certain info via your account
          or by contacting us.
        </li>
        <li>
          <strong>Deletion.</strong> You can request that we delete your personal information where required by law.
        </li>
        <li>
          <strong>Opt-Out.</strong> You can opt out of non-essential emails. Browser settings let you control cookies.
        </li>
        <li>
          <strong>EEA/UK Residents.</strong> If applicable, the lawful bases we rely on include performance of a
          contract, legitimate interests, consent (where required), and legal obligations.
        </li>
        <li>
          <strong>California Residents.</strong> We honor rights under the CCPA/CPRA where applicable; we do not sell
          personal information as defined by those laws.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        We use administrative, technical, and organizational measures appropriate to the risks of
        processing your data (e.g., HTTPS, restricted access, encryption in transit). No method of
        transmission or storage is 100% secure.
      </p>

      <h2>Children’s Privacy</h2>
      <p>
        The Site is not directed to children under 13, and we do not knowingly collect personal
        information from children under 13. If you believe a child has provided us information,
        please contact us to remove it.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. The “Effective date” will reflect the latest version.
      </p>

      <h2>Contact Us</h2>
      <p>
        Email: <a href="mailto:support@legendary-collectibles.com">support@legendary-collectibles.com</a><br />
        Address: {/* replace with your mailing address */} 123 Example St, Anytown, ST 00000, USA
      </p>
    </article>
  );
}
