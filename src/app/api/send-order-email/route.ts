import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

type EmailTemplate = 'order-delay' | 'order-update' | 'order-shipped';

type OrderItem = {
  name: string;
  qty: number;
  unitPrice: number;
};

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildItemsHtml(items: OrderItem[]): string {
  if (!items.length) {
    return '<li>Order details unavailable</li>';
  }

  return items
    .map((item) => {
      const safeName = escapeHtml(item.name);
      const qty = Number(item.qty || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const lineTotal = qty * unitPrice;

      return `<li>${safeName} — Qty ${qty} — ${formatMoney(unitPrice)} each — ${formatMoney(lineTotal)}</li>`;
    })
    .join('');
}

function getSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    return sum + Number(item.qty || 0) * Number(item.unitPrice || 0);
  }, 0);
}

function buildEmailHtml(params: {
  template: EmailTemplate;
  customerName: string;
  items: OrderItem[];
  shipping: number;
  total: number;
  trackingNumber?: string;
  trackingUrl?: string;
  customMessage?: string;
}) {
  const {
    template,
    customerName,
    items,
    shipping,
    total,
    trackingNumber,
    trackingUrl,
    customMessage,
  } = params;

  const safeName = escapeHtml(customerName || 'Customer');
  const subtotal = getSubtotal(items);
  const itemsHtml = buildItemsHtml(items);
  const safeCustomMessage = customMessage ? escapeHtml(customMessage) : '';

  const orderSummaryHtml = `
    <p><strong>Order Summary</strong></p>
    <ul>
      ${itemsHtml}
      <li>Subtotal — ${formatMoney(subtotal)}</li>
      <li>Shipping — ${formatMoney(shipping)}</li>
    </ul>
    <p><strong>Total — ${formatMoney(total)}</strong></p>
  `;

  if (template === 'order-delay') {
    return `
      <p>Hello ${safeName},</p>

      <p>Thank you for your order with <strong>Legendary Collectibles</strong>.</p>

      <p>
        We wanted to reach out with a quick update on your order. Normally we ship
        orders by the next business day, but we experienced an unexpected operational
        interruption that delayed outgoing shipments.
      </p>

      <p>We sincerely apologize for the delay.</p>

      ${
        safeCustomMessage
          ? `<p>${safeCustomMessage}</p>`
          : `<p>Your order is being prepared now and will be on its way as soon as possible.</p>`
      }

      ${orderSummaryHtml}

      <p>
        We truly appreciate your patience and your support of Legendary Collectibles.
      </p>

      <p>
        Best regards,<br />
        Legendary Collectibles
      </p>
    `;
  }

  if (template === 'order-update') {
    return `
      <p>Hello ${safeName},</p>

      <p>Thank you for your order with <strong>Legendary Collectibles</strong>.</p>

      <p>
        We wanted to send you a quick update on your order status.
      </p>

      ${
        safeCustomMessage
          ? `<p>${safeCustomMessage}</p>`
          : `<p>Your order is currently being processed and prepared for shipment.</p>`
      }

      ${orderSummaryHtml}

      <p>
        We appreciate your business and will keep you updated.
      </p>

      <p>
        Best regards,<br />
        Legendary Collectibles
      </p>
    `;
  }

  return `
    <p>Hello ${safeName},</p>

    <p>Great news — your order from <strong>Legendary Collectibles</strong> has shipped.</p>

    ${
      trackingNumber
        ? `<p><strong>Tracking Number:</strong> ${escapeHtml(trackingNumber)}</p>`
        : ''
    }

    ${
      trackingUrl
        ? `<p><a href="${escapeHtml(trackingUrl)}">Track your package</a></p>`
        : ''
    }

    ${
      safeCustomMessage
        ? `<p>${safeCustomMessage}</p>`
        : `<p>Your package is now in transit.</p>`
    }

    ${orderSummaryHtml}

    <p>
      Thank you again for your support of Legendary Collectibles.
    </p>

    <p>
      Best regards,<br />
      Legendary Collectibles
    </p>
  `;
}

function getSubject(template: EmailTemplate): string {
  switch (template) {
    case 'order-delay':
      return 'Important Update About Your Legendary Collectibles Order';
    case 'order-update':
      return 'Order Update from Legendary Collectibles';
    case 'order-shipped':
      return 'Your Legendary Collectibles Order Has Shipped';
    default:
      return 'Update from Legendary Collectibles';
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const template = String(body.template || '').trim() as EmailTemplate;
    const email = String(body.email || '').trim();
    const customerName = String(body.name || 'Customer').trim();
    const shipping = Number(body.shipping || 0);
    const total = Number(body.total || 0);
    const trackingNumber = body.trackingNumber
      ? String(body.trackingNumber).trim()
      : '';
    const trackingUrl = body.trackingUrl ? String(body.trackingUrl).trim() : '';
    const customMessage = body.customMessage
      ? String(body.customMessage).trim()
      : '';

    const items: OrderItem[] = Array.isArray(body.items)
      ? body.items.map((item: unknown) => {
          const obj = item as Partial<OrderItem>;
          return {
            name: String(obj?.name || '').trim(),
            qty: Number(obj?.qty || 0),
            unitPrice: Number(obj?.unitPrice || 0),
          };
        })
      : [];

    if (!email) {
      return NextResponse.json(
        { ok: false, error: 'Missing email' },
        { status: 400 }
      );
    }

    if (!template || !['order-delay', 'order-update', 'order-shipped'].includes(template)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid template' },
        { status: 400 }
      );
    }

    if (!items.length) {
      return NextResponse.json(
        { ok: false, error: 'At least one item is required' },
        { status: 400 }
      );
    }

    const html = buildEmailHtml({
      template,
      customerName,
      items,
      shipping,
      total,
      trackingNumber,
      trackingUrl,
      customMessage,
    });

    const data = await resend.emails.send({
      from: 'Legendary Collectibles <sales@legendary-collectibles.com>',
      to: [email],
      subject: getSubject(template),
      html,
    });

    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    console.error('send-order-email error:', error);

    const message =
      error instanceof Error ? error.message : 'Failed to send email';

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
