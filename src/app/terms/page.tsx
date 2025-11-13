import "server-only";

/**
 * ===== Quick setup =====
 * Update these constants to match your business.
 */
const COMPANY_NAME = "Legendary Collectibles LLC";
const SITE_DOMAIN = "legendary-collectibles.com";
const CONTACT_EMAIL = "support@legendary-collectibles.com";
const COMPANY_ADDRESS = "123 Main Street, Your City, ST 00000, USA";
const GOVERNING_LAW = "the laws of the State of [Your State], USA";
const ARBITRATION_VENUE = "[Your County], [Your State], USA";
const LAST_UPDATED = "2025-11-11";

/**
 * Notes:
 * - This template is general information, not legal advice. Have counsel review before publishing.
 * - If you don’t want arbitration/class-action waiver, remove Section 18.
 */

export const metadata = {
  title: `Terms of Service | ${COMPANY_NAME}`,
  description: `Terms of Service for ${COMPANY_NAME} at ${SITE_DOMAIN}`,
};

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-10 space-y-8 text-white">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <div className="text-white/70 text-sm">
          Last updated: {LAST_UPDATED}
        </div>
        <p className="text-white/80">
          Welcome to {COMPANY_NAME} ({SITE_DOMAIN}). These Terms of Service (“Terms”) govern your
          access to and use of our websites, apps, APIs, data exports, subscriptions, and any other
          products or services we offer (collectively, the “Services”). By accessing or using the
          Services, you agree to be bound by these Terms.
        </p>
      </header>

      <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur">
        <h2 className="text-xl font-semibold">Summary (not a substitute for the full Terms)</h2>
        <ul className="mt-3 list-disc pl-5 text-white/80 space-y-1">
          <li>You must be at least 13 (or the age required by your jurisdiction) to use the Services.</li>
          <li>Pro subscriptions auto-renew until you cancel. You can cancel anytime to stop future renewals.</li>
          <li>Price sheets, alerts, and valuation reports are informational only — not appraisal, financial, or legal advice.</li>
          <li>We use third-party data sources; data can be delayed, incomplete, or inaccurate.</li>
          <li>We may change or discontinue features, enforce fair use, and suspend accounts that violate these Terms.</li>
          <li>We limit our liability to the extent permitted by law. See Sections 15–17.</li>
        </ul>
      </div>

      <Section title="1. Who we are">
        <p>
          {COMPANY_NAME} operates {SITE_DOMAIN}. You can contact us at{" "}
          <a className="text-sky-300 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
          or by mail at {COMPANY_ADDRESS}.
        </p>
      </Section>

      <Section title="2. Eligibility">
        <p>
          You may use the Services only if you can form a binding contract with {COMPANY_NAME} and
          are not barred from doing so under applicable law. If you are under the age of majority,
          you must have your parent or legal guardian’s permission.
        </p>
      </Section>

      <Section title="3. Accounts & Security">
        <ul className="list-disc pl-5 space-y-1 text-white/80">
          <li>You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.</li>
          <li>Provide accurate information and keep it current.</li>
          <li>Notify us immediately of any unauthorized use or security incident.</li>
        </ul>
      </Section>

      <Section title="4. Subscriptions; Pro Plan">
        <p>
          We offer free and paid tiers. Paid subscriptions (e.g., “Pro”) may include features such
          as nightly downloadable price sheets (CSV), price-move alerts, collection exports, and
          valuation PDFs, plus any other benefits we advertise. We may add, remove, or modify plan
          features at any time.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-white/80 mt-2">
          <li><b>Billing & Auto-renewal.</b> Subscriptions bill in advance and auto-renew until you cancel.</li>
          <li><b>Cancellation.</b> You can cancel anytime; service continues until the end of the current term.</li>
          <li><b>Refunds.</b> Unless required by law or our posted policy, payments are non-refundable.</li>
          <li><b>Taxes.</b> Prices exclude applicable taxes; you’re responsible for any required taxes/fees.</li>
        </ul>
      </Section>

      <Section title="5. Payments">
        <p>
          We use third-party payment processors (e.g., Stripe). By submitting a payment method, you
          authorize us (and our processor) to charge your payment method for subscriptions,
          renewals, and any other purchases. We may retry failed charges and collect any applicable
          taxes. You agree to the processor’s terms in addition to ours.
        </p>
      </Section>

      <Section title="6. Data Sources; Price & Valuation Disclaimers">
        <ul className="list-disc pl-5 space-y-1 text-white/80">
          <li>
            Our pricing data may incorporate third-party sources and snapshots (e.g., marketplace
            listings, historical sales, community datasets). Data can be delayed, incomplete, or
            erroneous. We do not guarantee accuracy, timeliness, or availability.
          </li>
          <li>
            Price sheets, alerts, and valuation/insurance PDFs are <b>informational only</b>, not
            appraisal, financial, tax, or legal advice. Do not rely on them for buying, selling,
            insuring, or investing decisions without independent verification.
          </li>
          <li>
            Where we reference third-party brands, publishers, or platforms (e.g., TCGplayer,
            Cardmarket, eBay, Scryfall), those entities are independent and not affiliated with us
            unless we say otherwise. Trademarks belong to their respective owners.
          </li>
        </ul>
      </Section>

      <Section title="7. Content You Submit">
        <p>
          If you upload, post, or submit content (e.g., images, listings, comments), you retain
          ownership and grant {COMPANY_NAME} a worldwide, non-exclusive, royalty-free license to
          host, store, reproduce, display, and distribute that content solely to operate and improve
          the Services. You represent you have the rights necessary to grant this license.
        </p>
      </Section>

      <Section title="8. Acceptable Use">
        <ul className="list-disc pl-5 space-y-1 text-white/80">
          <li>No unlawful, infringing, deceptive, or harmful activity.</li>
          <li>No scraping, rate-limiting bypasses, automated queries, or reverse engineering our systems or pricing without permission.</li>
          <li>No attempts to gain unauthorized access or disrupt the Services.</li>
          <li>Respect intellectual property and privacy rights.</li>
        </ul>
      </Section>

      <Section title="9. Fair Use; Exports & API">
        <p>
          We may throttle, limit, or revoke access to bulk downloads, exports, or APIs to protect
          platform stability and data partners. Automated access requires our written permission.
        </p>
      </Section>

      <Section title="10. Marketplace (if/when enabled)">
        <p>
          If you list or purchase items through any marketplace feature, you agree to comply with
          applicable laws (including prohibited items rules), accurately describe items and their
          condition, and honor transactions. We are not a party to transactions between users unless
          expressly stated.
        </p>
      </Section>

      <Section title="11. Intellectual Property">
        <p>
          The Services (including software, design, text, graphics, data models, and logos) are
          owned by or licensed to {COMPANY_NAME} and protected by IP laws. Except as expressly
          permitted, you may not copy, modify, distribute, or create derivative works.
        </p>
      </Section>

      <Section title="12. Third-Party Links & Services">
        <p>
          The Services may link to or integrate third-party sites or services. We are not
          responsible for their content, terms, or policies. Use them at your own risk.
        </p>
      </Section>

      <Section title="13. Privacy">
        <p>
          Our collection and use of personal information are described in our{" "}
          <a className="text-sky-300 underline" href="/privacy">Privacy Policy</a>. You consent to
          our processing consistent with that policy.
        </p>
      </Section>

      <Section title="14. Changes to the Services">
        <p>
          We may modify, discontinue, or suspend any feature with or without notice. We are not
          liable for changes or downtime.
        </p>
      </Section>

      <Section title="15. Warranty Disclaimer">
        <p>
          THE SERVICES ARE PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND,
          EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          NON-INFRINGEMENT, AND ACCURACY OF DATA. YOUR USE IS AT YOUR OWN RISK.
        </p>
      </Section>

      <Section title="16. Limitation of Liability">
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {COMPANY_NAME} AND ITS AFFILIATES, OFFICERS,
          EMPLOYEES, AGENTS, AND PARTNERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          CONSEQUENTIAL, SPECIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE,
          DATA, OR GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF THE SERVICES, EVEN IF ADVISED OF
          THE POSSIBILITY. OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE AMOUNT YOU PAID TO
          US FOR THE SERVICES IN THE 3 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM.
        </p>
      </Section>

      <Section title="17. Indemnification">
        <p>
          You agree to defend, indemnify, and hold harmless {COMPANY_NAME} from any claims, damages,
          liabilities, and expenses (including reasonable attorneys’ fees) arising from your use of
          the Services, your content, or your violation of these Terms or applicable law.
        </p>
      </Section>

      <Section title="18. Dispute Resolution; Arbitration; Class-Action Waiver (US)">
        <p>
          Any dispute arising out of or relating to these Terms or the Services will be resolved by
          binding arbitration on an individual basis, and not as a class action or representative
          proceeding, in {ARBITRATION_VENUE}. You and {COMPANY_NAME} waive the right to a jury
          trial. You may seek relief in small-claims court if eligible. This Section does not apply
          where prohibited by law.
        </p>
      </Section>

      <Section title="19. Governing Law">
        <p>
          These Terms are governed by {GOVERNING_LAW}, without regard to conflict-of-law rules.
        </p>
      </Section>

      <Section title="20. Termination">
        <p>
          We may suspend or terminate your access at any time for any reason, including violation of
          these Terms. You may stop using the Services at any time. Sections that by their nature
          should survive will survive termination (e.g., IP, disclaimers, limitations, indemnity).
        </p>
      </Section>

      <Section title="21. Changes to These Terms">
        <p>
          We may update these Terms from time to time. If we make material changes, we will provide
          notice (e.g., by email or by posting on the site). Your continued use after changes become
          effective means you accept the updated Terms.
        </p>
      </Section>

      <Section title="22. Contact">
        <p>
          Questions? Contact us at{" "}
          <a className="text-sky-300 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="prose prose-invert max-w-none text-white/80">{children}</div>
    </section>
  );
}
