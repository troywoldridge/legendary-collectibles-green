

// Node 18+
import { spawn } from 'node:child_process';

const jobs = [
  ['node', ['scripts/cron/updateMtgPrices.scryfall.mjs']],
  ['node', ['scripts/cron/updateYgoPrices.mjs']],
  ['node', ['scripts/cron/updatePokemonPrices.mjs']],
  // eBay last so we fill gaps after primary feeds
  ['node', ['scripts/cron/fetchMtgEbayPrices.mjs', '--only-missing-primary', '--only-missing-ebay', '--days=7', '--limit=0', '--batch=800', '--concurrency=4']],
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${[cmd, ...args].join(' ')} ===\n`);
    const p = spawn(cmd, args, { stdio: 'inherit', env: process.env });
    p.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
    });
  });
}

for (let i = 0; i < jobs.length; i++) {

  await run(jobs[i][0], jobs[i][1]);
}

console.log('\n✅ prices:all completed\n');

