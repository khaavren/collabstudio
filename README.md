# Band Joes Studio

Notion-inspired collaborative web app for realtime product development around AI-generated concept images, with an admin account/infrastructure module.

## Stack
- Next.js App Router + TypeScript + Tailwind
- Supabase (Auth, Postgres, Realtime, Storage)
- Vercel deployment target

## Core App Features
- Room list + creation (`/rooms`)
- Notion-like asset board gallery (`/rooms/[roomId]`)
- Persistent right-side inspector panel (version timeline, prompt history, preview, annotation pins, comments)
- Realtime updates for assets, versions, comments
- Generate flow:
  - new asset if none selected
  - new version if asset selected
  - calls `POST /api/generate-image`
  - uploads image to `bandjoes-assets` storage
  - updates latest cover image

## Admin Module (`/admin`)
Protected by `ADMIN_EMAILS` and secure server routes.

### Section 1 — Organization Profile
- Manage organization identity and contact/address fields
- Upload logo

### Section 2 — Account & Team Settings
- Team member list
- Invite by email (Supabase admin invite)
- Role assignment (`admin`, `editor`, `viewer`)
- Remove member

### Section 3 — Model API Configuration
- Provider/model/default size/default params
- Encrypted API key storage (AES-256-GCM)
- Test connection action
- Configured/Not Configured status

### Section 4 — Usage & Limits (read-only)
- Current month usage metrics display

### Section 5 — Security & Environment
- Supabase status
- Storage bucket status
- Model API configured status
- Last settings update
- App version

## Environment Variables
Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SETTINGS_ENCRYPTION_KEY=long_random_secret_for_aes
ADMIN_EMAILS=admin1@company.com,admin2@company.com
```

Notes:
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and used by protected admin APIs.
- `SETTINGS_ENCRYPTION_KEY` encrypts/decrypts model API keys server-side only.
- No API key secrets are returned to the browser.

## Supabase SQL Setup
Run this SQL file in Supabase SQL editor:

- `supabase/schema.sql`

It creates/updates:
- `organizations`
- `team_members`
- `rooms`
- `assets`
- `asset_versions`
- `comments`
- `api_settings`
- `usage_metrics`
- RLS policies for organization scoping + role enforcement
- Storage bucket/policies for `bandjoes-assets`
- Realtime publication entries

## Local Development
```bash
npm install
npm run dev
```

Routes:
- `/` -> `/rooms`
- `/rooms`
- `/rooms/[roomId]`
- `/admin`

## Seed Demo Content
Seeds two rooms and required sample assets/versions:
- Band Joes Hard Hat Tri-Mount™
- Band Joes Connect™ Cross Adapter Clip
- Band Joes Grid System™ Starter Kit
- Band Joes ShipCross™ Coffee Subscription

Run:
```bash
npm run seed:demo
```

## Deploy to Vercel
1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Add all required environment variables in Vercel Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SETTINGS_ENCRYPTION_KEY`
   - `ADMIN_EMAILS`
4. Deploy.

No `vercel.json` is required.

Optional CLI preview deploy:
```bash
npm run deploy:preview
```

## Validation Commands
```bash
npm run lint
npm run typecheck
npm run build
```
