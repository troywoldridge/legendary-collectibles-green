import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
} = process.env;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT ?? 587),
  secure: String(SMTP_SECURE ?? "false") === "true",
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }) {
  const from = MAIL_FROM || "no-reply@localhost";
  const info = await transporter.sendMail({ from, ...opts });
  return info;
}
