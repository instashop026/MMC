# Model Feed

A mobile-first creator feed and catalog built with Vanilla TypeScript, browser DOM APIs, Vite, Supabase, and Netlify Functions.

## Local development

1. Create `artifacts/model-feed/.env.local` from `.env.example`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the Supabase project URL and publishable (or legacy anon) key. Replit Secrets named `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are also accepted by the Vite build.
3. From the workspace root, install dependencies and start the artifact:

   ```sh
   pnpm install --filter @workspace/model-feed
   pnpm --filter @workspace/model-feed run dev
   ```

The Vite preview and Supabase-backed pages work in the artifact workflow. ZeroStorage browsing uses the Netlify Function at `/.netlify/functions/zerostorage-browser`; Vite by itself does not run that function. Test ZeroStorage browsing in a Netlify Functions runtime or on a Netlify deploy.

Run checks and create the static production build with:

```sh
pnpm --filter @workspace/model-feed run typecheck
pnpm --filter @workspace/model-feed run build
```

The static site is written to `artifacts/model-feed/dist`.

## Supabase setup

1. Create a Supabase project and enable email/password sign-in under **Authentication → Providers**.
2. Apply the SQL files in `supabase/migrations/` in numeric order (`001_initial_schema.sql`, then `002_row_level_security.sql`) using the Supabase SQL Editor, or link the project and run `supabase db push` from `artifacts/model-feed`.
3. Add the local Vite settings to `.env.local`. The publishable key is intended for browser use; database access is restricted by the included row-level security policies.
4. In **Authentication → URL Configuration**, set the local and deployed site URLs and allowed redirect URLs.
5. After creating the account that should administer the catalog, promote its profile from the trusted SQL Editor using that account's Auth user UUID:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = '<auth-user-uuid>';
   ```

   The app does not let users promote themselves. Keep this role change in a trusted database administration session.

## Netlify deployment

The root `netlify.toml` configures the artifact base directory, build command, `dist` publish directory, SPA fallback, and `netlify/functions` directory. Connect the repository to Netlify and use those settings.

Set these variables in Netlify's site environment settings:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase URL; safe to embed in the browser build |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key; safe to embed in the browser build |
| `ZEROSTORAGE_API_KEY` | Secret used only by the ZeroStorage browsing function |

The Vite config embeds only the Supabase URL and publishable key. The ZeroStorage function uses the same Supabase values to verify the caller's session and administrator role. A Supabase service-role key is not required or used by this app; never add it to a `VITE_` variable or browser code.

After setting environment variables, trigger a fresh deploy so the browser build receives the Supabase settings. The ZeroStorage function checks the caller's Supabase session and administrator role before forwarding folder/file listing requests.

## Catalog rules and current scope

- Each linked ZeroStorage file creates one post. The ZeroStorage file ID is the canonical unique media identity; the media URL is derived for display.
- CTele and EB posts are images. WT posts are videos.
- CSV/bulk import is intentionally not included; linking is manual, one file at a time.
- Models, styles, posts, follows, Likes, MMCs, and comments are stored in Supabase and protected by the included RLS policies.