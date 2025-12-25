// Minimal CSV parser that supports quoted fields, commas, and newlines in quotes.
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // ignore completely empty trailing row
    if (row.length === 1 && row[0].trim() === "") return;
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && c === ",") {
      pushField();
      continue;
    }

    if (!inQuotes && (c === "\n" || c === "\r")) {
      // handle CRLF
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushField();
      pushRow();
      continue;
    }

    field += c;
  }

  // last field/row
  pushField();
  pushRow();

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => (h ?? "").trim());
  const out: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      record[key] = (rows[r][c] ?? "").trim();
    }
    out.push(record);
  }

  return { headers, rows: out };
}

export function toIntSafe(v: string, fallback: number | null = null) {
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}
