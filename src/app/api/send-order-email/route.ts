import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || '').trim();
    const name = String(body.name || '').trim();

    if (!email) {
      return NextResponse.json(
        { ok: false, error: 'Missing email' },
        { status: 400 }
      );
    }

    const data = await resend.emails.send({
      from: 'Legendary Collectibles <orders@legendary-collectibles.com>',
      to: [email],
      subject: 'Shipping Update for Your Legendary Collectibles Order',
      html: `
        <p>Hello ${name || 'Eddie'},</p>

        <p>Thank you for your order with <strong>Legendary Collectibles</strong>.</p>

        <p>
          We wanted to reach out regarding your order for the
          <strong>Jersey Fusion Rookie Edition Hobby Box</strong>.
          Normally we ship orders by the next business day, but we were unexpectedly
          closed yesterday due to an operational interruption that prevented us from
          processing outgoing shipments.
        </p>

        <p>We sincerely apologize for the delay.</p>

        <p>
          Your order is now being prepared and will ship via
          <strong>USPS Ground Advantage</strong>. As soon as it ships, you will
          receive tracking information.
        </p>

        <p><strong>Order Summary</strong></p>
        <ul>
          <li>Jersey Fusion Rookie Edition Hobby Box — $45.00</li>
          <li>USPS Ground Advantage — $9.75</li>
        </ul>

        <p><strong>Total — $54.75</strong></p>

        <p>
          We truly appreciate your patience and your support of Legendary Collectibles.
        </p>

        <p>
          Best regards,<br />
          Legendary Collectibles
        </p>
      `,
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