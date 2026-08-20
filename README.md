# Shorts Tracker

A single-page dashboard that tracks **YouTube Shorts** (short-form videos, ≤ 60s) for any set of
channels. Add a YouTube username/handle, and Shorts Tracker resolves it to a channel, pulls every
Short from its uploads playlist, and shows live view/like/comment stats — persisted in Postgres so
they never disappear on refresh.

Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Prisma** and the
**YouTube Data API v3**.

## Features

- Add one or many channels at once (comma-separated), e.g. `@mrbeast, @veritasium`
- Resolves handles to channel IDs via `channels.list?forHandle` (with `search.list` fallback)
- **Date-range monitoring config**: when adding (or editing) a channel you can pick an
  optional historical window — "Old videos from" → "Old videos to" (both required, any dates):
  - Leave it empty → no historical videos; only **new uploads** are tracked.
  - Set a range → every Short published within [from, to] (inclusive days) is pulled in as an
    **Old** video. The uploads playlist is paginated newest-first and scanning stops as soon as
    it reaches a video older than the range start.
- **Bucket system**: every Short belongs to the `latest` or `old` bucket, purely derived from
  its publish date relative to `channels.added_at`. All videos are tracked permanently — there
  is **no eviction** and nothing is ever untracked. Editing a channel to a narrower range never
  deletes already-tracked videos; widening it backfills the new additions.
- **Dedupe safety**: a `(channel_id, video_id)` unique constraint guarantees one row per video,
  and insert paths always skip videos already stored (never the same video in both buckets).
- **Hourly monitoring** (`POST /api/cron/hourly`, secured by `CRON_SECRET`): discovers uploads
  published after `channels.added_at` into the latest bucket, refreshes stats for every
  tracked Short, and records a `view_snapshots` row per Short so hourly growth
  (`▲ 1,234 /hr`) can be shown.
- Fetches Shorts from a channel's uploads playlist (paginated, `videos.list` batched in
  groups of 50) and filters by `duration <= 60s`
- Every channel and every Short is stored in a Postgres database — data survives refreshes and
  sessions, on any device
- Single-page dashboard: cards grouped by channel, each showing thumbnail, title, view count,
  like count, comment count, and published date
- **Full numbers** everywhere (e.g. `2,237,781` views) — no k/M abbreviations
- **Per-user data isolation**: each anonymous visitor gets an `httpOnly` `session_id` cookie
  (set by `middleware.ts`, 1-year expiry) backed by a `users` row. Every channel/short in the
  database belongs to exactly one user, and all API routes scope strictly by `user_id` — two
  people on the same app never see each other's data.
- **API quota tracking**: every YouTube Data API call is logged to `api_usage_log`
  (search.list = 100 units, channels.list / playlistItems.list / videos.list = 1 each), the
  dashboard shows a live "API Credits" badge with a progress bar, and adding/refreshing is
  blocked with a friendly message once the 10,000-unit daily quota is exhausted
  (`GET /api/quota` exposes `{ used, remaining, total, resetsAt }`, reset boundary = midnight
  Pacific).
- Per-channel **Refresh** and global **Refresh All** buttons run a monitoring pass on demand
  (discover new uploads + update stats)
- Sort Shorts by newest / views / likes / comments
- Graceful YouTube API error handling (e.g. friendly quota-exceeded message)

## Tech stack

- Next.js 14 (App Router) + TypeScript
- Prisma ORM with a PostgreSQL database (works with Vercel Postgres, Neon, or any Postgres)
- Tailwind CSS
- YouTube Data API v3 (server-side only — the API key is never exposed to the client)

## Project structure

```
app/
  page.tsx                        # Dashboard (client component)
  api/channels/route.ts           # GET list + POST add (with latest/old counts)
  api/channels/[id]/route.ts      # PATCH config + DELETE channel
  api/channels/[id]/refresh/route.ts
  api/refresh-all/route.ts
  api/cron/hourly/route.ts        # Hourly monitoring pass (CRON_SECRET-guarded)
components/                       # Dashboard UI components
middleware.ts                     # Sets the httpOnly session_id cookie on every request
lib/
  prisma.ts                       # Prisma client singleton
  youtube.ts                      # YouTube API integration (resolve, scan, filtering)
  channels.ts                     # Date-range bucket logic (seed range, discovery, snapshots)
  session.ts / session-constants.ts   # Anonymous session <-> user row resolution
  types.ts, format.ts
prisma/schema.prisma              # DB schema
vercel.json                       # Cron schedule ("0 * * * *" -> /api/cron/hourly)
```

## Getting a YouTube API key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or select an existing one).
3. Enable the **YouTube Data API v3**:
   Library → search for "YouTube Data API v3" → Enable.
4. Go to **APIs & Services → Credentials** → **Create Credentials → API key**.
5. Copy the key and put it in `.env` as `YOUTUBE_API_KEY`.

The free quota is **10,000 units/day**. Adding/refreshing a channel costs roughly
`2 + (uploads / 50) + (shorts / 50)` units, so a 500-video channel costs ~24 units.

## Setting up the database

You can use **Vercel Postgres (Neon)**, **Neon**, or any Postgres. Get a connection string and
put it in `.env` as `DATABASE_URL` (see `.env.example`).

**Option A — Vercel Postgres / Neon:**

1. Create a Vercel Postgres or Neon project and copy the pooled connection string
   (for Prisma, prefer the `?sslmode=require` non-pooled URL, or the pooled URL with
   `?pgbouncer=true&connection_limit=1`).
2. Put it in `.env`:
   ```
   DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"
   ```

**Option B — local Postgres:**

```bash
createdb shorts_tracker
# DATABASE_URL="postgresql://user:password@localhost:5432/shorts_tracker"
```

### Running Prisma migrations

```bash
npm install                 # also runs `prisma generate` (postinstall)
cp .env.example .env        # fill in your values
npx prisma migrate dev      # creates/applyies migrations and generates the client
```

On a fresh deploy (Vercel), migrations are applied with `npx prisma migrate deploy`
(run it once, or in the deploy step below).

## Running locally

```bash
npm install
cp .env.example .env        # set YOUTUBE_API_KEY and DATABASE_URL
npx prisma migrate dev      # apply DB migrations + generate client
npm run dev
```

Open http://localhost:3000, add a handle like `@veritasium`, and its Shorts appear.

## API routes

| Method | Route                            | Purpose                                              |
| ------ | -------------------------------- | ---------------------------------------------------- |
| GET    | `/api/channels`                  | List all saved channels with their Shorts + stats    |
| POST   | `/api/channels`                  | Add handle(s) with `oldFromDate`/`oldToDate`, seed the old range |
| PATCH  | `/api/channels/[id]`             | Change the historical date range (backfill, never delete) |
| POST   | `/api/channels/[id]/refresh`     | Monitoring pass for one channel (discover + stats)   |
| POST   | `/api/refresh-all`               | Monitoring pass for all channels                     |
| DELETE | `/api/channels/[id]`             | Remove a channel (and its Shorts)                    |
| POST   | `/api/cron/hourly`               | Hourly discovery + stats + snapshots (CRON_SECRET)   |
| GET    | `/api/quota`                     | Self-tracked API quota usage `{ used, remaining, total, resetsAt }` |

All YouTube calls happen server-side; the key stays in `YOUTUBE_API_KEY`. Every call is logged
into `api_usage_log` with its unit cost, and `GET /api/quota` aggregates the current Pacific
quota day (resets at midnight America/Los_Angeles). The quota figure is self-tracked from our
own calls — it can drift from the Cloud Console total if quota is changed or other apps share
the key.

## Deploying to Vercel

1. Push the repo to GitHub and import it in
   [Vercel](https://vercel.com/new), or use the CLI:
   ```bash
   npx vercel login
   npx vercel deploy --prod
   ```
2. In the **Vercel dashboard → Settings → Environment Variables**, add:
   - `YOUTUBE_API_KEY` — your YouTube API key
   - `DATABASE_URL` — your Postgres connection string
   - `CRON_SECRET` — a long random string (used to authenticate the hourly cron job)
3. In the **Build Settings** (or the CLI), set the Build Command to:
   ```bash
   npx prisma migrate deploy && npm run build
   ```
   (the `postinstall` script already runs `prisma generate` automatically during install).
4. Deploy. The dashboard is live at your Vercel URL.
5. The hourly cron (see `vercel.json`) only runs from **production** and on a paid plan;
   on the Vercel Hobby plan cron jobs are limited to once per day. It can also be
   invoked manually (e.g. `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/hourly`).

> If `prisma migrate deploy` is not run on the first deploy, visit the project's
> Terminal on Vercel (or run `npx prisma migrate deploy` locally against the same DB)
> once to create the tables.

## Notes on how Shorts are detected

The YouTube Data API has no `isShort` flag. Shorts Tracker therefore treats videos from a
channel's uploads playlist with `contentDetails.duration <= 60s` as Shorts (the widely used
heuristic). Some ≤60s non-Shorts may slip through; that is expected and unavoidable with the
public API.

## License

MIT
