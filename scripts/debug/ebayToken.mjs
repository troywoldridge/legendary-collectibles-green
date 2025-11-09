/* eslint-disable no-console */
// Node 18+
// Usage: node scripts/debug/ebayToken.mjs
// Requires: pnpm add undici  (or npm i undici)

import 'dotenv/config';
import { request } from 'undici';

const {
  EBAY_ENV = 'PROD',
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EBAY_SCOPE,
} = process.env;

const OAUTH_URL =
  EBAY_ENV === 'PROD'
    ? 'https://api.ebay.com/identity/v1/oauth2/token'
    : 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';

const DEFAULT_SCOPE =
  'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/buy.browse';

function mask(s, keep = 6) {
  if (!s) return '(missing)';
  const head = s.slice(0, keep);
  return `${head}${'•'.repeat(Math.max(0, s.length - keep))} (len=${s.length})`;
}

function stripQuotes(s) {
  if (!s) return s;
  // If user accidentally wrapped env in quotes, trim them
  return s.replace(/^"(.*)"$/, '$1').trim();
}

(async () => {
  const cid = stripQuotes(EBAY_CLIENT_ID || '');
  const csec = stripQuotes(EBAY_CLIENT_SECRET || '');
  const scope = stripQuotes(EBAY_SCOPE || '') || DEFAULT_SCOPE;

  console.log('== eBay OAuth probe ==');
  console.log('ENV     :', EBAY_ENV);
  console.log('Endpoint:', OAUTH_URL);
  console.log('ClientID:', mask(cid));
  console.log('Secret  :', mask(csec));
  console.log('Scope   :', scope);

  if (!cid || !csec) {
    console.error('\nMissing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET. ' +
      'Use your Production App ID as EBAY_CLIENT_ID and Production Cert ID as EBAY_CLIENT_SECRET.');
    process.exit(1);
  }

  if (csec.startsWith('v^')) {
    console.warn('\n⚠️  Your EBAY_CLIENT_SECRET looks like a user token (starts with v^...). ' +
      'That is NOT the Cert ID. Put your short Cert ID here.');
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('scope', scope);

  const auth = Buffer.from(`${cid}:${csec}`).toString('base64');

  const res = await request(OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: body.toString(),
  });

  const text = await res.body.text();
  console.log('\nStatus :', res.statusCode);
  try {
    const json = JSON.parse(text);
    console.log('Response:', JSON.stringify(json, null, 2));
  } catch {
    console.log('Response:', text);
  }

  if (res.statusCode >= 400) process.exit(1);
})();
