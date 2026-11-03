# TiDB deployment

Render: repository capstone-team404/Spring404, branch main, root backend.
Deploy TLS changes in backend/db.py before changing environment variables.
Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME=safety_db, DB_SSL=true.
Set CORS_ORIGINS to the actual Vercel frontend origin (no trailing slash).
Set AI_BASE_URL to the public HTTPS AI service URL; remove stale AI_HOST/AI_PORT.
Do not publish .env files or passwords.

## Public data
Current CSVs are restored legacy coordinates, NOT independently verified public data.
CCTV/store source files match the historical merged file. Police provenance unverified.
No sample lamp data has been imported. Counts: CCTV 140, stores 137, police 4.
The database public_data_import_history records source, SHA256, verification state,
grid definition and backup path. No visual label has been added to the frontend.

## Future updates
Run backend/scripts/replace_public_safety_csv.py with an explicit --types scope.
The input must be the COMPLETE snapshot for selected facility types in the configured grid.
Without --apply the script validates only. Every selected type must have an in-grid row;
intentional all-empty removals require separate reviewed handling.
Other types and user/review tables are preserved. Before replacement, a local JSON
backup is written; aggregate replacement and its history commit together.
Run one importer at a time. Grid changes require a separate migration.
Keep the backup files outside the repository. Obtain verified source URLs and
collection dates before labeling imports verified. Do not use the disabled legacy importer.
