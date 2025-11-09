import 'dotenv/config';

const {
  EBAY_ENV = 'PROD',                  // PROD or SANDBOX
  EBAY_TRADING_TOKEN,                 // seller's long-lived user token (from Dev Portal)
  EBAY_SITEID = '0',                  // 0 = US
  EBAY_PLATFORM_URL = 'https://www.legendary-collectibles.com/api/ebay/platform',
} = process.env;

if (!EBAY_TRADING_TOKEN) {
  console.error('Missing EBAY_TRADING_TOKEN'); process.exit(1);
}

const endpoint = EBAY_ENV.toUpperCase() === 'SANDBOX'
  ? 'https://api.sandbox.ebay.com/ws/api.dll'
  : 'https://api.ebay.com/ws/api.dll';

const events = [
  'ItemListed',
  'ItemRevised',
  'ItemClosed',
  'FixedPriceTransaction',
  'AuctionCheckoutComplete',
  'ItemSold'
];

const eventXml = events.map(ev => `
  <NotificationEnable>
    <EventType>${ev}</EventType>
    <EventEnable>Enable</EventEnable>
  </NotificationEnable>`).join('');

const xml = `<?xml version="1.0" encoding="utf-8"?>
<SetNotificationPreferencesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${EBAY_TRADING_TOKEN}</eBayAuthToken></RequesterCredentials>
  <ApplicationDeliveryPreferences>
    <ApplicationEnable>Enable</ApplicationEnable>
    <ApplicationURL>${EBAY_PLATFORM_URL}</ApplicationURL>
    <DeviceType>Platform</DeviceType>
  </ApplicationDeliveryPreferences>
  <UserDeliveryPreferenceArray>
    ${eventXml}
  </UserDeliveryPreferenceArray>
</SetNotificationPreferencesRequest>`;

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'text/xml',
    'X-EBAY-API-CALL-NAME': 'SetNotificationPreferences',
    'X-EBAY-API-SITEID': EBAY_SITEID,
    'X-EBAY-API-COMPATIBILITY-LEVEL': '967'
  },
  body: xml
});

const text = await res.text();
console.log('HTTP', res.status);
console.log(text);
