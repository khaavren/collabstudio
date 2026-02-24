# Band Joes Studio

Band Joes Studio is a Notion-inspired collaborative product development app for concept images.

## Stack
- React 18 + TypeScript + Vite
- React Router v7 (Data mode)
- Tailwind CSS v4
- lucide-react
- Supabase (Postgres, Auth, Realtime, Storage)
- Vercel deployment

## Routes
- `/` redirects to `/room/hard-hat-system`
- `/room/:roomId` main workspace

## UI Structure
- Left sidebar (240px): room navigation + new room + user block
- Main area: room header, search/filter, generate CTA, asset grid
- Right inspector (400px when selected):
  - version timeline
  - prompt history
  - image preview with annotation pins
  - comments thread
- Generate modal for new assets/new versions

## Environment Variables
Create `.env.local`:

```bash
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Vercel environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Supabase Setup
1. Create a Supabase project.
2. Run SQL in order:
   1. `supabase/schema.sql`
   2. `supabase/seed.sql`
3. In Supabase Storage, confirm bucket `asset-images` is public.
4. Enable anonymous sign-in (Auth -> Providers -> Anonymous) if you want write actions without user login.

## Data Model
Tables implemented in `supabase/schema.sql`:
- `rooms`
- `assets`
- `asset_tags`
- `asset_versions`
- `annotations`
- `comments`

RLS setup:
- Public read on all tables
- Authenticated write on all tables

## Local Development
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Deploy to Vercel
### Option 1 (UI)
1. Push this repo to GitHub.
2. Import to Vercel.
3. Set env vars:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Build settings:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
5. Redeploy after setting env vars (Vite injects `VITE_*` at build time).

### Option 2 (CLI preview)
```bash
npm run deploy:preview
```

## Notes
- Asset image generation currently uses deterministic placeholder images and uploads them to Supabase Storage.
- Real-time updates are wired with Supabase Realtime subscriptions for assets, versions, annotations, and comments.
- If Vercel shows a blank page, verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel, then trigger a new deployment.
