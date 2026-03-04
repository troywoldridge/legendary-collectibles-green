<?php
declare(strict_types=1);

/**
 * Daily tcgdex sync script.
 *
 * Usage (production):
 *   DB_DSN="pgsql:host=localhost;port=5432;dbname=legendary" \
 *   DB_USER="postgres" DB_PASS="..." php scripts/tcgdex/daily_tcgdex_sync.php
 *
 * Usage (dry run):
 *   DRY_RUN=1 php scripts/tcgdex/daily_tcgdex_sync.php
 */

final class TcgdexSync
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly TcgdexApiClientInterface $api,
        private readonly bool $dryRun = false
    ) {}

    public function run(): array
    {
        $cards = $this->api->fetchCards();
        $today = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d');
        $now = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:sP');

        $existingIds = $this->loadExistingCardIds();
        $incomingIds = [];

        $updated = 0;
        $inserted = 0;
        $removed = 0;
        $snapshots = 0;

        if (!$this->dryRun) {
            $this->pdo->beginTransaction();
        }

        try {
            foreach ($cards as $card) {
                $id = (string)($card['id'] ?? '');
                if ($id === '') {
                    continue;
                }
                $incomingIds[$id] = true;

                $existing = array_key_exists($id, $existingIds);
                $this->upsertCard($card, $now);
                $existing ? $updated++ : $inserted++;

                $snapshots += $this->upsertSnapshots($id, $card, $today, $now);
            }

            foreach (array_keys($existingIds) as $id) {
                if (isset($incomingIds[$id])) {
                    continue;
                }
                $removed++;
                if (!$this->dryRun) {
                    $this->pdo->prepare('DELETE FROM tcg_cards WHERE id = :id')->execute([':id' => $id]);
                    $this->insertRemovalSnapshot($id, $today, $now);
                    $snapshots++;
                }
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
            'processed' => count($cards),
            'inserted' => $inserted,
            'updated' => $updated,
            'removed' => $removed,
            'snapshots' => $snapshots,
            'dryRun' => $this->dryRun,
        ];
    }

    /** @return array<string,bool> */
    private function loadExistingCardIds(): array
    {
        $rows = $this->pdo->query("SELECT id FROM tcg_cards")->fetchAll(PDO::FETCH_ASSOC);
        $out = [];
        foreach ($rows as $r) {
            $out[(string)$r['id']] = true;
        }
        return $out;
    }

    /** @param array<string,mixed> $card */
    private function upsertCard(array $card, string $now): void
    {
        if ($this->dryRun) {
            return;
        }

        $set = is_array($card['set'] ?? null) ? $card['set'] : [];
        $image = is_array($card['image'] ?? null) ? $card['image'] : [];
        $pricing = is_array($card['pricing'] ?? null) ? $card['pricing'] : [];

        $extra = [
            'source' => 'tcgdex',
            'number' => $card['number'] ?? null,
            'localId' => $card['localId'] ?? null,
            'pricing' => $pricing,
            'fetchedAt' => $now,
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
            ':id' => (string)$card['id'],
            ':name' => (string)($card['name'] ?? ''),
            ':set_id' => (string)($set['id'] ?? ''),
            ':set_name' => (string)($set['name'] ?? ''),
            ':rarity' => (string)($card['rarity'] ?? ''),
            ':small_image' => (string)($image['low'] ?? ''),
            ':large_image' => (string)($image['high'] ?? ''),
            ':tcgplayer_url' => (string)($pricing['tcgplayer']['url'] ?? ''),
            ':tcgplayer_updated_at' => (string)($pricing['tcgplayer']['updatedAt'] ?? ''),
            ':cardmarket_url' => (string)($pricing['cardmarket']['url'] ?? ''),
            ':cardmarket_updated_at' => (string)($pricing['cardmarket']['updatedAt'] ?? ''),
            ':extra' => json_encode($extra, JSON_THROW_ON_ERROR),
        ]);
    }

    private function upsertSnapshots(string $cardId, array $card, string $today, string $now): int
    {
        $pricing = is_array($card['pricing'] ?? null) ? $card['pricing'] : [];
        $count = 0;

        $usd = $this->pickUsd($pricing);
        if ($usd !== null) {
            $this->upsertDailySnapshot($cardId, $today, 'USD', (int)round($usd * 100), $card, $now);
            $count++;
        }

        $eur = $this->pickEur($pricing);
        if ($eur !== null) {
            $this->upsertDailySnapshot($cardId, $today, 'EUR', (int)round($eur * 100), $card, $now);
            $count++;
        }

        return $count;
    }

    private function insertRemovalSnapshot(string $cardId, string $today, string $now): void
    {
        $this->upsertDailySnapshot($cardId, $today, 'USD', 0, ['removed' => true], $now);
    }

    private function upsertDailySnapshot(string $cardId, string $date, string $currency, int $cents, array $raw, string $now): void
    {
        if ($this->dryRun) {
            return;
        }

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
        foreach (['normal', 'holofoil', 'reverse-holofoil', '1st-edition', 'unlimited'] as $variant) {
            $entry = is_array($tcgplayer[$variant] ?? null) ? $tcgplayer[$variant] : [];
            foreach (['marketPrice', 'midPrice', 'lowPrice'] as $k) {
                if (isset($entry[$k]) && is_numeric($entry[$k])) {
                    return (float)$entry[$k];
                }
            }
        }
        return null;
    }

    private function pickEur(array $pricing): ?float
    {
        $cardmarket = is_array($pricing['cardmarket'] ?? null) ? $pricing['cardmarket'] : [];
        foreach (['trend', 'avg30', 'avg7', 'avg', 'low'] as $k) {
            if (isset($cardmarket[$k]) && is_numeric($cardmarket[$k])) {
                return (float)$cardmarket[$k];
            }
        }
        return null;
    }
}

interface TcgdexApiClientInterface
{
    /** @return array<int,array<string,mixed>> */
    public function fetchCards(): array;
}

final class HttpTcgdexApiClient implements TcgdexApiClientInterface
{
    public function __construct(private readonly string $baseUrl = 'https://api.tcgdex.net/v2/en/cards') {}

    public function fetchCards(): array
    {
        $ch = curl_init($this->baseUrl);
        if ($ch === false) {
            throw new RuntimeException('Failed to initialize cURL.');
        }

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

        if ($errno !== 0) {
            throw new RuntimeException("tcgdex request failed (network): {$error}");
        }
        if ($status < 200 || $status >= 300) {
            throw new RuntimeException("tcgdex request failed (HTTP {$status}).");
        }
        if (!is_string($body) || $body === '') {
            throw new RuntimeException('tcgdex request returned an empty response.');
        }

        $decoded = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) {
            throw new RuntimeException('Unexpected tcgdex payload format.');
        }
        return $decoded;
    }
}

function createPdoFromEnv(): PDO
{
    $dsn = getenv('DB_DSN') ?: 'pgsql:host=localhost;port=5432;dbname=legendary';
    $user = getenv('DB_USER') ?: 'postgres';
    $pass = getenv('DB_PASS') ?: '';

    try {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (Throwable $e) {
        throw new RuntimeException('Database connection failed: ' . $e->getMessage(), 0, $e);
    }

    return $pdo;
}

if (basename(__FILE__) === basename((string)($_SERVER['SCRIPT_FILENAME'] ?? ''))) {
    try {
        $pdo = createPdoFromEnv();
        $dryRun = in_array(strtolower((string)getenv('DRY_RUN')), ['1', 'true', 'yes'], true);
        $sync = new TcgdexSync($pdo, new HttpTcgdexApiClient(), $dryRun);
        $result = $sync->run();
        echo json_encode(['ok' => true, 'result' => $result], JSON_PRETTY_PRINT) . PHP_EOL;
    } catch (Throwable $e) {
        fwrite(STDERR, json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_PRETTY_PRINT) . PHP_EOL);
        exit(1);
    }
}
