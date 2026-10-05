---
name: Model Feed constraints
description: User-set architecture, scope, and credential boundaries for this app.
---

For this project:
- Use Vanilla TypeScript and browser DOM APIs; do not introduce React, Next.js, Express, or another heavy framework without a concrete technical requirement.
- Do not use Replit-specific backend services or infrastructure.
- Keep CSV import out of this version.
- Never expose the ZeroStorage API key or Supabase service-role key to the browser.
- The user says the Netlify `ZEROSTORAGE_API_KEY` is already configured; do not ask them for it.
- The ZeroStorage browser may start at the storage root; do not require a `0RMCOIN` folder.
- The Replit dev workflow runs Vite only, so it does not execute Netlify Functions; reject the SPA HTML fallback instead of rendering a false empty listing.

**Why:** The user stated these as hard project requirements, confirmed the ZeroStorage key is already configured, and allowed browsing from the storage root when `0RMCOIN` was not found. The Replit preview returned Vite's HTML page with status 200 for the Netlify function path, which the client had treated as an empty listing.

**How to apply:** Preserve these boundaries when extending the Model Feed app. Keep privileged credentials server-side, use the existing Supabase/Netlify architecture, do not request the ZeroStorage key, and do not assume a named folder exists at the storage root. Verify browsing against a running Netlify function before concluding the storage root is empty.