<?php
declare(strict_types=1);

require __DIR__ . '/../scripts/tcgdex/daily_tcgdex_sync.php';

final class FakeClient implements TcgdexApiClientInterface {
    /** @param array<int,array<string,mixed>> $cards */
    public function __construct(private array $cards, private bool $throw = false) {}
    public function fetchCards(): array {
        if ($this->throw) {
            throw new RuntimeException('Simulated network failure');
        }
        return $this->cards;
    }
}

function setupSqlite(): PDO {
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->exec('CREATE TABLE tcg_cards (
      id TEXT PRIMARY KEY,
      name TEXT,
      set_id TEXT,
      set_name TEXT,
      rarity TEXT,
      small_image TEXT,
      large_image TEXT,
      tcgplayer_url TEXT,
      tcgplayer_updated_at TEXT,
      cardmarket_url TEXT,
      cardmarket_updated_at TEXT,
      extra TEXT
    )');

    $pdo->exec('CREATE TABLE tcgdex_price_snapshots_daily (
      card_id TEXT NOT NULL,
      as_of_date TEXT NOT NULL,
      currency TEXT NOT NULL,
      market_price_cents INTEGER NOT NULL,
      raw_json TEXT,
      created_at TEXT,
      updated_at TEXT,
      PRIMARY KEY(card_id, as_of_date, currency)
    )');

    return $pdo;
}

$cardV1 = [
    'id' => 'base1-4',
    'name' => 'Charizard',
    'set' => ['id' => 'base1', 'name' => 'Base'],
    'rarity' => 'Rare Holo',
    'image' => ['low' => 'low.png', 'high' => 'high.png'],
    'pricing' => [
      'tcgplayer' => ['normal' => ['marketPrice' => 123.45], 'url' => 'https://tcg', 'updatedAt' => '2026-03-04'],
      'cardmarket' => ['trend' => 110.10, 'url' => 'https://cm', 'updatedAt' => '2026-03-04'],
    ],
];

$cardV2 = $cardV1;
$cardV2['pricing']['tcgplayer']['normal']['marketPrice'] = 130.00;

$newCard = [
    'id' => 'base1-58',
    'name' => 'Pikachu',
    'set' => ['id' => 'base1', 'name' => 'Base'],
    'rarity' => 'Common',
    'image' => ['low' => 'p-low.png', 'high' => 'p-high.png'],
    'pricing' => [
      'tcgplayer' => ['normal' => ['marketPrice' => 9.99]],
      'cardmarket' => ['trend' => 8.49],
    ],
];

// 1) Simulated network failure
$pdo1 = setupSqlite();
try {
    (new TcgdexSync($pdo1, new FakeClient([], true), false))->run();
    throw new RuntimeException('Expected simulated network failure.');
} catch (RuntimeException $e) {
    if (!str_contains($e->getMessage(), 'Simulated network failure')) {
        throw $e;
    }
}

// 2) Existing card update
$pdo2 = setupSqlite();
$sync = new TcgdexSync($pdo2, new FakeClient([$cardV1]), false);
$sync->run();

$createdAtBefore = (string)$pdo2->query("SELECT created_at FROM tcgdex_price_snapshots_daily WHERE card_id='base1-4' AND currency='USD'")->fetchColumn();
usleep(1_100_000);

$sync = new TcgdexSync($pdo2, new FakeClient([$cardV2]), false);
$sync->run();

$createdAtAfter = (string)$pdo2->query("SELECT created_at FROM tcgdex_price_snapshots_daily WHERE card_id='base1-4' AND currency='USD'")->fetchColumn();
$updatedPrice = (int)$pdo2->query("SELECT market_price_cents FROM tcgdex_price_snapshots_daily WHERE card_id='base1-4' AND currency='USD'")->fetchColumn();
if ($updatedPrice !== 13000 || $createdAtBefore !== $createdAtAfter) {
    throw new RuntimeException('Price update test failed (price and/or created_at behavior incorrect).');
}

// 3) New card addition
$sync = new TcgdexSync($pdo2, new FakeClient([$cardV2, $newCard]), false);
$result = $sync->run();
$newExists = (int)$pdo2->query("SELECT COUNT(*) FROM tcg_cards WHERE id='base1-58'")->fetchColumn();
$newSnap = (int)$pdo2->query("SELECT market_price_cents FROM tcgdex_price_snapshots_daily WHERE card_id='base1-58' AND currency='USD'")->fetchColumn();
if ($newExists !== 1 || $newSnap !== 999) {
    throw new RuntimeException('New card insert test failed.');
}

// 4) Removal snapshots preserve currency consistency (USD always, EUR when previously present)
$sync = new TcgdexSync($pdo2, new FakeClient([]), false);
$result = $sync->run();

$removedUsd = (int)$pdo2->query("SELECT market_price_cents FROM tcgdex_price_snapshots_daily WHERE card_id='base1-4' AND currency='USD'")->fetchColumn();
$removedEur = (int)$pdo2->query("SELECT market_price_cents FROM tcgdex_price_snapshots_daily WHERE card_id='base1-4' AND currency='EUR'")->fetchColumn();

if ($removedUsd !== 0 || $removedEur !== 0) {
    throw new RuntimeException('Removal snapshot test failed (expected zeroed USD and EUR rows).');
}

echo json_encode(['ok' => true, 'result' => $result], JSON_PRETTY_PRINT) . PHP_EOL;
