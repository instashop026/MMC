# Model Feed

A mobile-first creator feed and admin catalog for models, posts, styles, follows, Likes, MMCs, and comments.

## Run & operate

- Web preview: `pnpm --filter @workspace/model-feed run dev`
- Typecheck: `pnpm --filter @workspace/model-feed run typecheck`
- Production build: `pnpm --filter @workspace/model-feed run build`
- Full workspace checks: `pnpm run typecheck` and `pnpm run build`

The app is a Vanilla TypeScript + Vite frontend backed by Supabase. The ZeroStorage browser is a Netlify Function at `/.netlify/functions/zerostorage-browser`; Vite alone does not run Netlify Functions, so live ZeroStorage browsing must be checked in a Netlify Functions runtime or deployment.

## Architecture decisions

- Preserve the existing Vanilla TypeScript, Vite, Supabase, and Netlify Functions architecture; do not migrate it to another stack.
- ZeroStorage remains the only media store. Keep its privileged API key server-side in the Netlify Function; never expose it to browser code.
- Use ZeroStorage file IDs as canonical media identity and derive image/video display URLs from `src/lib/zerostorage-urls.ts`.
- The admin browser is locked to `0RMCOIN/`. Import requires an explicit creator selection; folder names never select or infer a creator.
- Gallery folders group review controls, not posts: every imported image and video creates its own post. Do not add CSV import or delete ZeroStorage files.
- Preserve the dark premium styling and existing product behavior. Manual model profile-image URLs remain supported alongside ZeroStorage profile images.

## Where things live

- `src/app.ts` — routes, page rendering, event handling, model forms, ZeroStorage selection and import publishing
- `src/components/admin-views.ts` — admin import, ZeroStorage browser, and review markup
- `src/services/zerostorage.ts` — ZeroStorage folder/file listing, root discovery, validation, and source-path mapping
- `netlify/functions/zerostorage-browser.ts` — authenticated server-side proxy to ZeroStorage
- `src/services/models.ts` and `src/services/posts.ts` — Supabase catalog operations
- `src/lib/zerostorage-urls.ts` — current ZeroStorage image and video URLs
- `src/lib/import-metadata.ts` — filename captions and video style-tag parsing
- `supabase/migrations/` — Supabase schema and row-level security migrations

## Setup and gotchas

- Apply all Supabase migrations in numeric order, including `003_model_zerostorage_profile_image.sql`, before using the profile-image file ID field.
- The administrator role is assigned through a trusted Supabase SQL session; the app does not allow users to promote themselves.
- Netlify needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `ZEROSTORAGE_API_KEY`. The ZeroStorage key is used only by the Netlify Function.
- When checking imports, confirm both the admin review and the final posts in Supabase. A bulk import can preserve earlier successful posts if a later item fails.