import { describe, it, expect, vi } from "vitest";

// Make Next's `server-only` a no-op in test env
vi.mock("server-only", () => ({}));

describe("Email templates", () => {
  it("supportReceiptTemplate includes ticket, subject, and message", async () => {
    const { supportReceiptTemplate } = await import("../src/emails/templates");

    const t = supportReceiptTemplate({
      ticketId: "LC-20251104-ABC123",
      name: "Ash",
      subject: "Order question",
      message: "Where is my card?\nThanks!",
    });

    expect(t.subject).toContain("LC-20251104-ABC123");
    expect(t.text).toContain("Order question");
    expect(t.text).toContain("Where is my card?");
    expect(t.html).toContain("Order question");
    expect(t.html).toContain("Where is my card?");
  });

  it("supportStaffTemplate formats staff email correctly", async () => {
    const { supportStaffTemplate } = await import("../src/emails/templates");

    const s = supportStaffTemplate({
      ticketId: "LC-20251104-ABC999",
      name: "Misty",
      fromEmail: "misty@example.com",
      subject: "Damaged card",
      message: "Corners bent",
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0",
    });

    expect(s.subject).toContain("LC-20251104-ABC999");
    expect(s.text).toContain("misty@example.com");
    expect(s.text).toContain("Damaged card");
    expect(s.text).toContain("Corners bent");
    expect(s.html).toContain("misty@example.com");
  });

  it("Email.renderHtml wraps content in our branded layout", async () => {
    const { Email } = await import("../src/lib/email");
    const html = Email.renderHtml("Title", "<p>Body</p>");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Legendary Collectibles");
    expect(html).toContain("<p>Body</p>");
  });
});
