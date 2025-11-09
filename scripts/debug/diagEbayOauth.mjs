/* eslint-disable no-console */
import 'dotenv/config';

function hexDump(label, s) {
  const bytes = Array.from(Buffer.from(s, 'utf8')).map(b => b.toString(16).padStart(2,'0')).join(' ');
  console.log(`${label} len=${s.length} bytes=[${bytes}]`);
}

async function tryPair(name, id, secret, scope = 'https://api.ebay.com/oauth/api_scope') {
  if (!id || !secret) {
    console.log(`- ${name}: skipped (missing)`);
    return;
  }
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');

  console.log(`\n== ${name} ==`);
  console.log(`ID: ${id}`);
  console.log(`SECRET.len: ${secret.length}`);
  hexDump('ID:SECRET (decoded)', `${id}:${secret}`);

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
  });

  const text = await res.text();
  console.log(`Status: ${res.status}`);
  try {
    const j = JSON.parse(text);
    if (res.ok && j.access_token) {
      console.log('OK: token chars =', j.access_token.length);
    } else {
      console.log('Body:', j);
    }
  } catch {
    console.log('Raw body:', text);
  }
}

const id   = (process.env.EBAY_CLIENT_ID || '').trim();
const sec  = (process.env.EBAY_CLIENT_SECRET || '').trim();

// Optionally set EBAY_OLD_CLIENT_SECRET or EBAY_NEW_CLIENT_SECRET to try both
const secOld = (process.env.EBAY_OLD_CLIENT_SECRET || '').trim();
const secNew = (process.env.EBAY_NEW_CLIENT_SECRET || '').trim();

console.log('ENV check:');
console.log('  EBAY_CLIENT_ID len=', id.length);
console.log('  EBAY_CLIENT_SECRET len=', sec.length);
console.log('  EBAY_OLD_CLIENT_SECRET len=', secOld.length);
console.log('  EBAY_NEW_CLIENT_SECRET len=', secNew.length);

await tryPair('PRIMARY (.env EBAY_CLIENT_ID/SECRET)', id, sec);
if (secOld) await tryPair('OLD SECRET (.env EBAY_OLD_CLIENT_SECRET)', id, secOld);
if (secNew) await tryPair('NEW SECRET (.env EBAY_NEW_CLIENT_SECRET)', id, secNew);
