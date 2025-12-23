-- Preview candidate tables to drop (edit the patterns if needed)
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND (
    tablename LIKE 'mtg_%'
    OR tablename LIKE 'scryfall_%'
  )
ORDER BY tablename;
