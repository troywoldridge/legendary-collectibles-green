// src/emails/templates.ts
import { Email } from "../lib/email";

const brand = "Legendary Collectibles";
const brandUrl = "https://www.legendary-collectibles.com";
const supportEmail = "support@legendary-collectibles.com";

export function supportReceiptTemplate(opts: {
  ticketId: string;
  name?: string;
  subject: string;
  message: string;
}) {
  const title = `We got your message (Ticket ${opts.ticketId})`;
  const body = `
    <p>Hi${opts.name ? ` ${escapeHtml(opts.name)}` : ""},</p>
    <p>Thanks for contacting ${brand}! Your ticket is <strong>${opts.ticketId}</strong>.</p>
    <p><strong>Subject:</strong> ${escapeHtml(opts.subject)}</p>
    <div style="margin:12px 0;padding:12px;border:1px solid #eee;border-radius:8px;background:#fafafa;">
      <div style="font-weight:600;margin-bottom:6px;">Your message</div>
      <div>${escapeHtml(opts.message).replace(/\n/g, "<br/>")}</div>
    </div>
    <p>We usually reply within one business day. If you need to add info, reply to this email and it will attach to your ticket.</p>
    <p>– ${brand} Support</p>
    <p><a href="${brandUrl}" target="_blank" rel="noopener noreferrer">${brandUrl}</a></p>
  `;
  return {
    subject: `[${brand}] Ticket ${opts.ticketId} received`,
    html: Email.renderHtml(title, body),
    text:
      `We got your message (Ticket ${opts.ticketId})\n\n` +
      `Subject: ${opts.subject}\n\n` +
      `${opts.message}\n\n` +
      `${brand} Support\n${brandUrl}`,
  };
}

export function supportStaffTemplate(opts: {
  ticketId: string;
  name?: string;
  fromEmail: string;
  subject: string;
  message: string;
  ip?: string;
  userAgent?: string;
}) {
  const title = `New support ticket ${opts.ticketId}`;
  const body = `
    <p><strong>From:</strong> ${escapeHtml(opts.name || "Customer")} &lt;${escapeHtml(opts.fromEmail)}&gt;</p>
    <p><strong>Subject:</strong> ${escapeHtml(opts.subject)}</p>
    <p><strong>Ticket:</strong> ${opts.ticketId}</p>
    ${opts.ip ? `<p><strong>IP:</strong> ${escapeHtml(opts.ip)}</p>` : ""}
    ${opts.userAgent ? `<p><strong>UA:</strong> ${escapeHtml(opts.userAgent)}</p>` : ""}
    <div style="margin:12px 0;padding:12px;border:1px solid #eee;border-radius:8px;background:#fafafa;">
      <div style="font-weight:600;margin-bottom:6px;">Message</div>
      <div>${escapeHtml(opts.message).replace(/\n/g, "<br/>")}</div>
    </div>
  `;
  return {
    subject: `🆕 Support ticket ${opts.ticketId}: ${opts.subject}`,
    html: Email.renderHtml(title, body),
    text:
      `From: ${opts.name || "Customer"} <${opts.fromEmail}>\n` +
      `Subject: ${opts.subject}\nTicket: ${opts.ticketId}\n` +
      (opts.ip ? `IP: ${opts.ip}\n` : "") +
      (opts.userAgent ? `UA: ${opts.userAgent}\n` : "") +
      `\n${opts.message}\n`,
    to: process.env.SUPPORT_TO || supportEmail,
  };
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
