# Legendary Collectibles Deployment Notes

## Blue / Green
Green: port 3012
Blue: port 3011

Switch:
sudo legendary-switch-green
sudo legendary-switch-blue

## Nginx config
/etc/nginx/sites-available/legendary-collectibles
/etc/nginx/snippets/legendary-upstream-active.conf

## Cloudflare
SSL mode: Full (Strict)
DNS:
A legendary-collectibles.com -> 96.29.229.235 (proxied)
CNAME www -> legendary-collectibles.com (proxied)

## Health check
curl https://legendary-collectibles.com/api/health

