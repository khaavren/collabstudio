# Band Joes Studio

Band Joes Studio is a Notion-inspired collaborative product development app with Supabase-backed realtime collaboration and an admin control panel for organization and model settings.

## Stack
- React 18 + TypeScript + Vite
- React Router v7
- Tailwind CSS v4
- Supabase (Auth, Postgres, Realtime, Storage)
- Vercel (static frontend + serverless `/api/*`)

## Routes
- `/` -> marketing page (logged out) or dashboard (logged in)
- `/room/:roomId` -> main collaborative board
- `/workspace/:workspaceId/room/:roomId` -> workspace-scoped board
- `/admin` -> Account & Infrastructure Settings (protected by `ADMIN_EMAILS`)

## Environment Variables
Set these in `.env.local` for local dev and in Vercel Project Environment Variables:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SETTINGS_ENCRYPTION_KEY=
ADMIN_EMAILS=admin1@company.com,admin2@company.com
```

Notes:
- `VITE_*` values are safe for browser use and are required by the frontend.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. It is used only in `/api/admin/*` routes.
- `SETTINGS_ENCRYPTION_KEY` is used for AES-256-GCM encryption of model API keys.
- `ADMIN_EMAILS` controls `/admin` access.

## Supabase Setup
1. Open Supabase Dashboard -> SQL Editor.
2. Run `supabase/schema.sql`.
3. Do not run `supabase/seed.sql` in production (it inserts demo content).
4. In Auth -> Providers:
   - Enable `Anonymous` (for quick board usage)
   - Enable `Email` (for admin magic link sign-in)
5. Ensure Storage buckets exist (created by schema):
   - `asset-images` (board images)
   - `bandjoes-assets` (admin branding/logo)

## Admin Panel (`/admin`)
The admin module includes:
1. Organization Profile
2. Account & Team Settings
3. Model API Configuration
4. Usage & Limits
5. Security & Environment

API endpoints:
- `GET/POST /api/admin/settings`
- `GET /api/admin/me`
- `POST /api/admin/team/invite`
- `PATCH/DELETE /api/admin/team/:memberId`
- `POST /api/admin/test`

Security:
- Admin APIs require bearer token from Supabase session.
- Requests are authorized against `ADMIN_EMAILS`.
- Model API key is encrypted at rest (AES-256-GCM).
- Decrypted keys are never returned to the client.

## Local Development
```bash
npm install
npm run dev
```

For full-stack local testing of `/api/*` routes, run:

```bash
npx vercel dev
```

## Build / Typecheck
```bash
npm run typecheck
npm run build
```

## Deploy to Vercel
1. Push repo to GitHub.
2. Import project in Vercel.
3. Framework preset: `Vite`.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add all env vars listed above for `Production`, `Preview`, and `Development`.
7. Redeploy after environment variable changes.

`vercel.json` is configured to:
- serve filesystem paths (including `/api/*`) first
- fallback other routes to `index.html` for SPA routing.

## Placeholder Image Generation
The board calls `POST /api/generate-image`.
- If org model settings are configured, generation uses the configured provider/model.
- If provider generation fails or is not configured, the route falls back to deterministic Picsum placeholders.

## Production Workspace Data
- Workspaces and collaborators are persisted in Supabase tables (`workspaces`, `workspace_collaborators`).
- Dashboard no longer ships with seeded placeholder users/workspaces.
