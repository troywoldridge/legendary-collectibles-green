<?php
declare(strict_types=1);

/**
 * Daily tcgdex sync script (safe, pricing-aware, with progress output).
 *
 * Key modes:
 * - Default: upsert card + write snapshots (USD/EUR)
 * - UPDATE_IMAGES_ONLY=1: ONLY update small_image/large_image (no snapshots, minimal DB churn)
 *
 * Usage (production):
 *   DB_DSN="pgsql:host=localhost;port=5432;dbname=legendary" \
 *   DB_USER="troy" DB_PASS="..." \
 *   php scripts/tcgdex/daily_tcgdex_sync.php
 *
 * Usage (dry run):
 *   DRY_RUN=1 php scripts/tcgdex/daily_tcgdex_sync.php
 *
 * Throughput controls:
 *   SLEEP_MS=35
 *   MAX_CARDS=500     # default cap; set 0 for full
 *
 * Sharding controls:
 *   SHARD_TOTAL=8 SHARD_INDEX=0..7
 *
 * Progress controls:
 *   PROGRESS_EVERY=250
 *
 * Optional safety controls (ONLY applied on full-coverage runs):
 *   ALLOW_DELETES=1
 *   MARK_MISSING_AS_REMOVED=1
 */

final class TcgdexSync
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly TcgdexApiClientInterface $api,
        private readonly bool $dryRun = false,
        private readonly bool $allowDeletes = false,
        private readonly bool $markMissingAsRemoved = false,
        private readonly int $sleepMs = 35,
        private readonly int $maxCards = 0,
        private readonly int $shardTotal = 0,
        private readonly int $shardIndex = 0,
        private readonly int $progressEvery = 250,
        private readonly bool $updateImagesOnly = false,
    ) {}

    public function run(): array
    {
        $timestamp = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $today = $timestamp->format('Y-m-d');
        $now = $timestamp->format('Y-m-d H:i:sP');

        fwrite(STDERR, "[tcgdex] fetching card briefs...\n");
        $briefs = $this->api->fetchCardBriefs();
        $processedBriefs = count($briefs);
        fwrite(STDERR, "[tcgdex] briefs: {$processedBriefs}\n");

        $allIds = [];
        foreach ($briefs as $b) {
            $id = (string)($b['id'] ?? '');
            if ($id !== '') $allIds[] = $id;
        }
        $allIdsCount = count($allIds);

        // Build "this run's IDs"
        $ids = $this->applySharding($allIds, $this->shardTotal, $this->shardIndex);
        $shardedCount = count($ids);

        $isCapped = ($this->maxCards > 0 && $shardedCount > $this->maxCards);
        if ($isCapped) $ids = array_slice($ids, 0, $this->maxCards);

        $processedIds = count($ids);

        // Full coverage means: no sharding and not capped and processed == total
        $fullCoverage = ($this->shardTotal === 1) && (!$isCapped) && ($processedIds === $allIdsCount);

        fwrite(STDERR, "[tcgdex] will process ids: {$processedIds} (shard {$this->shardIndex}/{$this->shardTotal}, max {$this->maxCards})\n");
        fwrite(STDERR, "[tcgdex] fullCoverage=" . ($fullCoverage ? "true" : "false") . " updateImagesOnly=" . ($this->updateImagesOnly ? "true" : "false") . "\n");

        $incomingIds = [];

        // Only load existing tcgdex IDs if we might do missing handling
        $existingTcgdexIds = $fullCoverage ? $this->loadExistingTcgdexCardIdsTextExtra() : [];

        $inserted = 0;
        $updated = 0;
        $removed = 0;
        $snapshots = 0;

        $detailFetched = 0;
        $detailFailed = 0;
        $detailNoPricing = 0;

        if (!$this->dryRun) {
            $this->pdo->beginTransaction();
        }

        try {
            foreach ($ids as $i => $id) {
                $incomingIds[$id] = true;

                try {
                    $card = $this->api->fetchCardById($id);
                    $detailFetched++;
                } catch (Throwable $e) {
                    $detailFailed++;
                    if ($this->progressEvery > 0 && (($i + 1) % $this->progressEvery === 0)) {
                        fwrite(STDERR, "[tcgdex] progress " . ($i + 1) . "/{$processedIds} fetched={$detailFetched} failed={$detailFailed} snapshots={$snapshots}\n");
                    }
                    $this->sleepBetweenCalls();
                    continue;
                }

                if ($this->updateImagesOnly) {
                    $this->updateImagesForCard($card, $now);
                    $updated++;
                } else {
                    $alreadyExists = $this->cardExists($id);
                    $this->upsertCard($card, $now);
                    $alreadyExists ? $updated++ : $inserted++;

                    $added = $this->upsertSnapshots($id, $card, $today, $now);
                    $snapshots += $added;
                    if ($added === 0) $detailNoPricing++;
                }

                if ($this->progressEvery > 0 && (($i + 1) % $this->progressEvery === 0)) {
                    fwrite(STDERR, "[tcgdex] progress " . ($i + 1) . "/{$processedIds}" .
                        " fetched={$detailFetched} failed={$detailFailed}" .
                        " inserted={$inserted} updated={$updated}" .
                        " noPricing={$detailNoPricing} snapshots={$snapshots}\n");
                }

                $this->sleepBetweenCalls();
            }

            // Missing-from-feed handling ONLY on full coverage runs (and only matters in default mode)
            if ($fullCoverage && !$this->updateImagesOnly) {
                fwrite(STDERR, "[tcgdex] full coverage run: evaluating missing-from-feed...\n");

                foreach (array_keys($existingTcgdexIds) as $id) {
                    if (isset($incomingIds[$id])) {
                        $this->unmarkRemovedIfNeededTextExtra($id, $now);
                        continue;
                    }

                    $removed++;

                    if ($this->dryRun) continue;

                    if ($this->allowDeletes) {
                        $this->pdo->prepare('DELETE FROM tcg_cards WHERE id = :id')->execute([':id' => $id]);
                        $snapshots += $this->insertRemovalSnapshots($id, $today, $now);
                        continue;
                    }

                    if ($this->markMissingAsRemoved) {
                        $this->markRemovedTextExtra($id, $now);
                        $snapshots += $this->insertRemovalSnapshots($id, $today, $now);
                    }
                }
            } else {
                $removed = 0; // keep output honest for partial/images-only runs
            }

            if (!$this->dryRun) {
                $this->pdo->commit();
            }
        } catch (Throwable $e) {
            if (!$this->dryRun && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        return [
            'processed_briefs' => $processedBriefs,
            'processed_ids' => $processedIds,
            'detail_fetched' => $detailFetched,
            'detail_failed' => $detailFailed,
            'detail_no_pricing' => $detailNoPricing,
            'inserted' => $inserted,
            'updated' => $updated,
            'removed' => $removed,
            'snapshots' => $snapshots,
            'dryRun' => $this->dryRun,
            'allowDeletes' => $this->allowDeletes,
            'markMissingAsRemoved' => $this->markMissingAsRemoved,
            'sleepMs' => $this->sleepMs,
            'maxCards' => $this->maxCards,
            'shardTotal' => $this->shardTotal,
            'shardIndex' => $this->shardIndex,
            'progressEvery' => $this->progressEvery,
            'fullCoverage' => $fullCoverage,
            'updateImagesOnly' => $this->updateImagesOnly,
        ];
    }

    /** @return array<int,string> */
    private function applySharding(array $ids, int $total, int $index): array
    {
        if ($total <= 1) return $ids;
        if ($index < 0 || $index >= $total) return $ids;

        $out = [];
        foreach ($ids as $i => $id) {
            if (($i % $total) === $index) $out[] = $id;
        }
        return $out;
    }

    private function sleepBetweenCalls(): void
    {
        if ($this->sleepMs > 0) usleep($this->sleepMs * 1000);
    }

    private function cardExists(string $id): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM tcg_cards WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        return (bool)$stmt->fetchColumn();
    }

    /** @return array<string,bool> */
    private function loadExistingTcgdexCardIdsTextExtra(): array
    {
        $sql = <<<SQL
SELECT id
  FROM tcg_cards
 WHERE extra ~ '^\\s*\\{'
   AND (extra::jsonb->>'source') = 'tcgdex'
SQL;

        $rows = $this->pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) $out[(string)$r['id']] = true;
        return $out;
    }

    /**
     * Extract image URLs safely.
     *
     * TCGdex can return:
     *  - image as a string base url: "https://assets.tcgdex.net/en/swsh3/136"
     *  - OR image as an object with keys: { small/large } or { low/high }
     *
     * @return array{small:string, large:string}
     */
    private function extractImages(array $card): array
    {
        $image = $card['image'] ?? null;

        // Case A: string base URL
        if (is_string($image) && $image !== '') {
            $base = rtrim($image, '/');
            return [
                'small' => $base . '/low.webp',
                'large' => $base . '/high.webp',
            ];
        }

        // Case B: object with fields
        if (!is_array($image)) {
            return ['small' => '', 'large' => ''];
        }

        $small = '';
        $large = '';

        foreach (['low', 'small', 'thumb', 'thumbnail'] as $k) {
            if (isset($image[$k]) && is_string($image[$k]) && $image[$k] !== '') { $small = $image[$k]; break; }
        }
        foreach (['high', 'large'] as $k) {
            if (isset($image[$k]) && is_string($image[$k]) && $image[$k] !== '') { $large = $image[$k]; break; }
        }

        return ['small' => $small, 'large' => $large];
    }

    /** @param array<string,mixed> $card */
    private function updateImagesForCard(array $card, string $now): void
    {
        if ($this->dryRun) return;

        $id = (string)($card['id'] ?? '');
        if ($id === '') return;

        $imgs = $this->extractImages($card);

        $sql = <<<SQL
UPDATE tcg_cards
   SET small_image = :small_image,
       large_image = :large_image,
       extra = (
         CASE
           WHEN extra ~ '^\\s*\\{'
             THEN jsonb_set(extra::jsonb, '{fetchedAt}', to_jsonb(:fetched_at::text), true)::text
           ELSE extra
         END
       )
 WHERE id = :id
SQL;

        $this->pdo->prepare($sql)->execute([
            ':id' => $id,
            ':small_image' => $imgs['small'],
            ':large_image' => $imgs['large'],
            ':fetched_at' => $now,
        ]);
    }

    /** @param array<string,mixed> $card */
    private function upsertCard(array $card, string $now): void
    {
        if ($this->dryRun) return;

        $set = is_array($card['set'] ?? null) ? $card['set'] : [];
        $pricing = is_array($card['pricing'] ?? null) ? $card['pricing'] : [];
        $imgs = $this->extractImages($card);

        $extra = [
            'source' => 'tcgdex',
            'number' => $card['number'] ?? null,
            'localId' => $card['localId'] ?? null,
            'pricing' => $pricing,
            'fetchedAt' => $now,
            'removed' => false,
            'removedAt' => null,
        ];

        $sql = <<<SQL
INSERT INTO tcg_cards (
  id, name, set_id, set_name, rarity, small_image, large_image,
  tcgplayer_url, tcgplayer_updated_at, cardmarket_url, cardmarket_updated_at, extra
) VALUES (
  :id, :name, :set_id, :set_name, :rarity, :small_image, :large_image,
  :tcgplayer_url, :tcgplayer_updated_at, :cardmarket_url, :cardmarket_updated_at, :extra
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  set_id = excluded.set_id,
  set_name = excluded.set_name,
  rarity = excluded.rarity,
  small_image = excluded.small_image,
  large_image = excluded.large_image,
  tcgplayer_url = excluded.tcgplayer_url,
  tcgplayer_updated_at = excluded.tcgplayer_updated_at,
  cardmarket_url = excluded.cardmarket_url,
  cardmarket_updated_at = excluded.cardmarket_updated_at,
  extra = excluded.extra
SQL;

        $this->pdo->prepare($sql)->execute([
            ':id' => (string)($card['id'] ?? ''),
            ':name' => (string)($card['name'] ?? ''),
            ':set_id' => (string)($set['id'] ?? ''),
            ':set_name' => (string)($set['name'] ?? ''),
            ':rarity' => (string)($card['rarity'] ?? ''),
            ':small_image' => $imgs['small'],
            ':large_image' => $imgs['large'],
            ':tcgplayer_url' => (string)($pricing['tcgplayer']['url'] ?? ''),
            ':tcgplayer_updated_at' => (string)($pricing['tcgplayer']['updatedAt'] ?? $pricing['tcgplayer']['updated'] ?? ''),
            ':cardmarket_url' => (string)($pricing['cardmarket']['url'] ?? ''),
            ':cardmarket_updated_at' => (string)($pricing['cardmarket']['updatedAt'] ?? $pricing['cardmarket']['updated'] ?? ''),
            ':extra' => json_encode($extra, JSON_THROW_ON_ERROR),
        ]);
    }

    private function markRemovedTextExtra(string $id, string $now): void
    {
        if ($this->dryRun) return;

        $sql = <<<SQL
UPDATE tcg_cards
   SET extra = (
        CASE
          WHEN extra ~ '^\\s*\\{'
            THEN (
              jsonb_set(
                jsonb_set(extra::jsonb, '{removed}', 'true'::jsonb, true),
                '{removedAt}', to_jsonb(:removed_at::text), true
              )::text
            )
          ELSE extra
        END
      )
 WHERE id = :id
   AND extra ~ '^\\s*\\{'
   AND (extra::jsonb->>'source') = 'tcgdex'
SQL;

        $this->pdo->prepare($sql)->execute([':id' => $id, ':removed_at' => $now]);
    }

    private function unmarkRemovedIfNeededTextExtra(string $id, string $now): void
    {
        if ($this->dryRun) return;

        $sql = <<<SQL
UPDATE tcg_cards
   SET extra = (
        CASE
          WHEN extra ~ '^\\s*\\{'
            THEN (
              jsonb_set(
                jsonb_set(extra::jsonb, '{removed}', 'false'::jsonb, true),
                '{removedAt}', 'null'::jsonb, true
              )::text
            )
          ELSE extra
        END
      )
 WHERE id = :id
   AND extra ~ '^\\s*\\{'
   AND (extra::jsonb->>'source') = 'tcgdex'
SQL;

        $this->pdo->prepare($sql)->execute([':id' => $id]);
    }

    private function upsertSnapshots(string $cardId, array $card, string $today, string $now): int
    {
        $pricing = is_array($card['pricing'] ?? null) ? $card['pricing'] : [];
        if (!$pricing) return 0;

        $count = 0;

        $usd = $this->pickUsd($pricing);
        if ($usd !== null) { $this->upsertDailySnapshot($cardId, $today, 'USD', (int)round($usd * 100), $card, $now); $count++; }

        $eur = $this->pickEur($pricing);
        if ($eur !== null) { $this->upsertDailySnapshot($cardId, $today, 'EUR', (int)round($eur * 100), $card, $now); $count++; }

        return $count;
    }

    private function insertRemovalSnapshots(string $cardId, string $today, string $now): int
    {
        $count = 0;
        $this->upsertDailySnapshot($cardId, $today, 'USD', 0, ['removed' => true], $now);
        $count++;

        if ($this->hadRecentCurrencySnapshot($cardId, 'EUR')) {
            $this->upsertDailySnapshot($cardId, $today, 'EUR', 0, ['removed' => true], $now);
            $count++;
        }
        return $count;
    }

    private function hadRecentCurrencySnapshot(string $cardId, string $currency): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT 1 FROM tcgdex_price_snapshots_daily WHERE card_id = :card_id AND currency = :currency LIMIT 1'
        );
        $stmt->execute([':card_id' => $cardId, ':currency' => $currency]);
        return (bool)$stmt->fetchColumn();
    }

    private function upsertDailySnapshot(string $cardId, string $date, string $currency, int $cents, array $raw, string $now): void
    {
        if ($this->dryRun) return;

        $sql = <<<SQL
INSERT INTO tcgdex_price_snapshots_daily (card_id, as_of_date, currency, market_price_cents, raw_json, created_at, updated_at)
VALUES (:card_id, :as_of_date, :currency, :market_price_cents, :raw_json, :created_at, :updated_at)
ON CONFLICT(card_id, as_of_date, currency)
DO UPDATE SET market_price_cents = excluded.market_price_cents, raw_json = excluded.raw_json, updated_at = excluded.updated_at
SQL;

        $this->pdo->prepare($sql)->execute([
            ':card_id' => $cardId,
            ':as_of_date' => $date,
            ':currency' => $currency,
            ':market_price_cents' => $cents,
            ':raw_json' => json_encode($raw, JSON_THROW_ON_ERROR),
            ':created_at' => $now,
            ':updated_at' => $now,
        ]);
    }

    private function pickUsd(array $pricing): ?float
    {
        $tcgplayer = is_array($pricing['tcgplayer'] ?? null) ? $pricing['tcgplayer'] : [];
        foreach (['normal','holofoil','reverse-holofoil','reverse','1st-edition','unlimited'] as $variant) {
            $entry = is_array($tcgplayer[$variant] ?? null) ? $tcgplayer[$variant] : [];
            foreach (['marketPrice','midPrice','lowPrice','directLowPrice'] as $k) {
                if (isset($entry[$k]) && is_numeric($entry[$k])) return (float)$entry[$k];
            }
        }
        return null;
    }

    private function pickEur(array $pricing): ?float
    {
        $cardmarket = is_array($pricing['cardmarket'] ?? null) ? $pricing['cardmarket'] : [];
        foreach (['trend','avg30','avg7','avg','low'] as $k) {
            if (isset($cardmarket[$k]) && is_numeric($cardmarket[$k])) return (float)$cardmarket[$k];
        }
        foreach (['trend-holo','avg30-holo','avg7-holo','avg-holo','low-holo'] as $k) {
            if (isset($cardmarket[$k]) && is_numeric($cardmarket[$k])) return (float)$cardmarket[$k];
        }
        return null;
    }
}

interface TcgdexApiClientInterface
{
    /** @return array<int,array<string,mixed>> */
    public function fetchCardBriefs(): array;

    /** @return array<string,mixed> */
    public function fetchCardById(string $id): array;
}

final class HttpTcgdexApiClient implements TcgdexApiClientInterface
{
    public function __construct(
        private readonly string $baseListUrl = 'https://api.tcgdex.net/v2/en/cards',
        private readonly string $baseCardUrl = 'https://api.tcgdex.net/v2/en/cards/',
    ) {}

    public function fetchCardBriefs(): array
    {
        return $this->getJsonArray($this->baseListUrl);
    }

    public function fetchCardById(string $id): array
    {
        return $this->getJsonObject($this->baseCardUrl . rawurlencode($id));
    }

    /** @return array<int,array<string,mixed>> */
    private function getJsonArray(string $url): array
    {
        $decoded = $this->requestJson($url);
        if (!is_array($decoded)) throw new RuntimeException('Unexpected JSON payload (not an array).');
        return $decoded;
    }

    /** @return array<string,mixed> */
    private function getJsonObject(string $url): array
    {
        $decoded = $this->requestJson($url);
        if (!is_array($decoded)) throw new RuntimeException('Unexpected JSON payload (not an object).');
        return $decoded;
    }

    /** @return mixed */
    private function requestJson(string $url)
    {
        $ch = curl_init($url);
        if ($ch === false) throw new RuntimeException('Failed to initialize cURL.');

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 40,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['User-Agent: legendary-daily-tcgdex-sync/1.0'],
            CURLOPT_FAILONERROR => false,
        ]);

        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($errno !== 0) throw new RuntimeException("tcgdex request failed (network): {$error}");
        if ($status < 200 || $status >= 300) throw new RuntimeException("tcgdex request failed (HTTP {$status}).");
        if (!is_string($body) || $body === '') throw new RuntimeException('tcgdex request returned an empty response.');

        return json_decode($body, true, 512, JSON_THROW_ON_ERROR);
    }
}

function envFlag(string $name, bool $default = false): bool
{
    $v = getenv($name);
    if ($v === false || $v === null || $v === '') return $default;
    return in_array(strtolower((string)$v), ['1','true','yes','y','on'], true);
}

function envInt(string $name, int $default): int
{
    $v = getenv($name);
    if ($v === false || $v === null || $v === '') return $default;
    if (!is_numeric($v)) return $default;
    return (int)$v;
}

function createPdoFromEnv(): PDO
{
    $dsn = getenv('DB_DSN') ?: 'pgsql:host=localhost;port=5432;dbname=legendary';
    $user = getenv('DB_USER') ?: 'postgres';
    $pass = getenv('DB_PASS') ?: '';

    return new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

if (basename(__FILE__) === basename((string)($_SERVER['SCRIPT_FILENAME'] ?? ''))) {
    try {
        $pdo = createPdoFromEnv();

        $dryRun = envFlag('DRY_RUN', false);
        $allowDeletes = envFlag('ALLOW_DELETES', false);
        $markMissingAsRemoved = envFlag('MARK_MISSING_AS_REMOVED', false);
        if ($allowDeletes && $markMissingAsRemoved) $markMissingAsRemoved = false;

        $sleepMs = envInt('SLEEP_MS', 35);
        $maxCards = envInt('MAX_CARDS', 500);
        $shardTotal = envInt('SHARD_TOTAL', 1);
        $shardIndex = envInt('SHARD_INDEX', 0);
        $progressEvery = envInt('PROGRESS_EVERY', 250);
        $updateImagesOnly = envFlag('UPDATE_IMAGES_ONLY', false);

        $sync = new TcgdexSync(
            $pdo,
            new HttpTcgdexApiClient(),
            $dryRun,
            $allowDeletes,
            $markMissingAsRemoved,
            $sleepMs,
            $maxCards,
            $shardTotal,
            $shardIndex,
            $progressEvery,
            $updateImagesOnly
        );

        $result = $sync->run();
        echo json_encode(['ok' => true, 'result' => $result], JSON_PRETTY_PRINT) . PHP_EOL;
    } catch (Throwable $e) {
        fwrite(STDERR, json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_PRETTY_PRINT) . PHP_EOL);
        exit(1);
    }
}