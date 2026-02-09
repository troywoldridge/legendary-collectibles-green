Legendary Collectibles Deploy Flow

1. Commit + push
git add -A
git commit -m "message"
git push origin main

2. Pull on server
cd ~/apps/legendary-collectibles-green
git pull origin main

3. Build
pnpm install --frozen-lockfile
pnpm exec next build

4. Restart app
pm2 restart legendary-green

5. Verify
curl -I https://legendary-collectibles.com/cart/review
