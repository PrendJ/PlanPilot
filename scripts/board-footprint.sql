-- Real footprint of boards, cards and history in the production database (read-only).
-- Run with: psql "$DATABASE_URL" -f scripts/board-footprint.sql
-- Sizes include indexes and TOAST; averages divide by the current row counts. See docs/ANALISI_COSTO_BOARD_2026-10-25.md.

\echo '== Size per table (rows, total bytes incl. indexes, bytes per row) =='
SELECT relname AS "table",
       n_live_tup AS rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS total,
       CASE WHEN n_live_tup > 0 THEN pg_total_relation_size(relid) / n_live_tup END AS bytes_per_row
FROM pg_stat_user_tables
WHERE relname IN ('Workspace', 'BoardColumn', 'WorkspaceMember', 'Card', 'CardAssignee', 'CardComment',
                  'ActivityEvent', 'UpdateLog', 'AiProposal', 'Notification', 'UsageEvent')
ORDER BY pg_total_relation_size(relid) DESC;

\echo '== Boards per organization (distribution) =='
SELECT percentile_disc(ARRAY[0.5, 0.9, 0.99]) WITHIN GROUP (ORDER BY boards) AS p50_p90_p99, max(boards) AS max
FROM (SELECT "organizationId", count(*) AS boards FROM "Workspace" WHERE "lifecycleStatus" = 'ACTIVE' GROUP BY 1) per_org;

\echo '== Cards per board and history per card =='
SELECT (SELECT count(*) FROM "Card")::numeric / greatest(1, (SELECT count(*) FROM "Workspace")) AS cards_per_board,
       (SELECT count(*) FROM "ActivityEvent")::numeric / greatest(1, (SELECT count(*) FROM "Card")) AS events_per_card,
       (SELECT count(*) FROM "UpdateLog")::numeric / greatest(1, (SELECT count(DISTINCT "organizationId") FROM "Workspace")) AS ai_updates_per_org;

\echo '== Fixed cost of one empty board (workspace + its columns + its members), bytes =='
SELECT round(
  pg_total_relation_size('"Workspace"')::numeric / greatest(1, (SELECT count(*) FROM "Workspace"))
  + pg_total_relation_size('"BoardColumn"')::numeric / greatest(1, (SELECT count(*) FROM "Workspace"))
  + pg_total_relation_size('"WorkspaceMember"')::numeric / greatest(1, (SELECT count(*) FROM "Workspace"))
) AS bytes_per_empty_board;

\echo '== Database size =='
SELECT pg_size_pretty(pg_database_size(current_database())) AS database;
