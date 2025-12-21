# Album Ranker (Local)

Quickstart for local dev:

1) Install deps: `npm install`
2) Env: copy `.env.example` → `.env.local` and set:
   - `VITE_SUPABASE_URL=http://localhost:54321`
   - `VITE_SUPABASE_ANON_KEY=<from supabase status -o env>`
   - `VITE_SUPABASE_FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1`
   - `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
   - `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
3) Supabase local:
   - Configure Google via env (`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`) and set site_url/redirects, then `supabase start`
   - Rerun `supabase db reset` to apply migrations (creates bucket/policies)
   - Functions: `supabase functions serve --env-file supabase/functions/.env.local` with `SERVICE_ROLE_KEY=<local service role>`
4) Run app: `npm run dev` and sign in with Google (local config).
5) Ranking lists: defaults auto-create “All Time” and current year. Drag/drop to reorder, “this-or-that” on album detail adjusts rank.

Seeds (optional):
- `supabase/seed.sql` includes commented sample inserts; set your local user_id (from `auth.users`) before using. Running `supabase db reset` will try to load it if uncommented.

Workflows:
- Dev/Prod deploy workflows live in `.github/workflows/deploy-dev.yml` and `deploy-prod.yml`. Set environment secrets per GitHub Actions environments (dev/prod):
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_ID`
  - `SUPABASE_DB_PASSWORD`
- PR CI runs lint + build via `.github/workflows/ci.yml`.

Security note:
- `supabase/config.toml` reads Google client/secret from env (`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`).
- For local `supabase start`, export those env vars before starting Supabase. For hosted projects, set the Google client/secret in the Supabase dashboard (Auth → Providers → Google).
