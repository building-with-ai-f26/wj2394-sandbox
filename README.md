# Inner Table.

> **One-line pitch:** Where would my friend book? Find places for the occasion, with recommendations from people you trust. Starting in NYC.

- **Builder:** [Your Name] (`@github-handle`)
- **Pod:** 9
- **Product Page & Living PRD:** https://building-with-ai-f26.github.io/wj2394-sandbox/
- **Prototype on GitHub Pages:** https://building-with-ai-f26.github.io/wj2394-sandbox/prototype/
- **App:** runs locally through Week 4; add a cloud URL in Build 5.

## Start here: Build 1

**Due Monday, November 9 at noon, New York time.** No class November 3; keep building that week.

1. Join the [class organization](https://github.com/building-with-ai-f26), then use this template to create a **public** repo named `<netid>-<project-slug>`. Ask Christian or Hew if the organization is missing from the owner list.
2. Set up Git and one coding agent during the week of October 27. Follow the [Icerynk setup guide](https://www.icerynk.com/c/fa26-tech-gb-2160-dm2-f2/content/pre-class-setup-github-openrouter-your-coding-agent).
3. Publish [`docs/index.html`](./docs/index.html): **Settings → Pages → Deploy from a branch → main → /docs → Save**. When deployment finishes, open `https://building-with-ai-f26.github.io/<your-repo-name>/`.
4. Fill in PRD v1: a reachable user, their painful before/after workflow, one core workflow, and three non-goals.
5. Build a rough local prototype. Add a screenshot or GIF and an honest Build 1 log to the Product Page, including progress, learning, problems, costs, and hours.
6. Push meaningful commits on **at least two separate days each week outside class**, including the November 3 break.
7. Submit your **Product Page URL and repository URL in Icerynk**. Come ready to demo the prototype in two minutes on November 10.

Create your PostHog account in Week 1. Install it on the Product Page and local app in **Build 2**, then verify events. The Product Page is public from Build 1; the app can stay local through Week 4.

## Repository map

| File / folder | Purpose |
| --- | --- |
| [`docs/index.html`](./docs/index.html) | Required public pitch, living PRD, and weekly build log. Update with actual work and evidence. |
| [`Intent.md`](./Intent.md), [`Plan.md`](./Plan.md), [`journal/`](./journal/) | Optional drafting aids. No duplicate submission is required. |
| [`AGENTS.md`](./AGENTS.md) | Local run commands, project context, and agent rules. Build 2 onward. |
| [`tests/`](./tests/) | Verification guidance. Build 4 offers Track A domain evals **or** Track B user replays. |
| [`SPONSOR_MEMO.md`](./SPONSOR_MEMO.md) | One-page recommendation backed by actual usage, full costs, and risks. Due December 14 at noon. |

[Icerynk](https://www.icerynk.com/c/fa26-tech-gb-2160-dm2-f2/content) holds the assignment instructions and submissions.

## Local setup

Build 1 is a dependency-free HTML/CSS/JavaScript prototype. Add Google Maps links or import an unzipped Google Takeout Saved-list CSV under **My places**. After one bulk preview/confirmation, imported places are immediately available in Discover; there is no mandatory review of each entry. Any category is eligible, including uncategorized pins. Visit status, endorsement, category, notes, tags, neighborhood, budget, and guide visibility are editable anytime. Hide/show controls exclude a place without deleting it.

Import uses note, list-name, and export-tag keywords to suggest occasion tags. These are labeled as inferred and can be edited; they are not verified suitability claims. List names come from an export column or CSV filename. Cards distinguish saved-list suggestions from personal endorsements and show Been there / Want to try / Not specified. Missing categories, prices, neighborhoods, and visits are not inferred. A place with no price will not match a budget filter, and an uncategorized place will not match an explicit category request such as dinner or coffee. General browsing includes all visible places. NYC remains the initial geographic scope; importing does not verify a place's city. Multi-city discovery is planned later.

Your places are kept in this browser's local storage. Submitting a plan sends a guide summary to the configured AI provider as described below. Use **Export backup** and **Restore backup** to keep a copy. Use the same browser and origin (`127.0.0.1:8001`) to return to your data. Private browsing or clearing site data can remove it. Storage errors are shown in My places.

Discover searches your visible saved places. Fictional fixtures remain available for deterministic checks. The local server supports optional Google place enrichment and an AI plan conversation. Accounts and private sharing remain future work. **Connect Google** is a clearly labeled future entry point, not an authorization button.

From the repository root, run:

```powershell
python server.py --port 8001
```

Open `http://127.0.0.1:8001/prototype/` for the app, or `http://127.0.0.1:8001/` for the class product page. Stop the server with Ctrl+C. Do not use the repository-root server as a public deployment: it is for local development only.

GitHub Pages publishes `main:/docs`, so the prototype source lives in `docs/prototype/`. Use the Pages URLs above to run the public pages; GitHub's repository file viewer displays source. The local server serves `docs/` at its root, so the app path is `/prototype/`. Browser-stored places remain on their original origin: imports made at localhost are not transferred to GitHub Pages; use backup export/restore to move them.

Before noon each Monday (America/New_York), update the class page's **Unit Economics & Analytics Snapshot** and the active weekly build's **Cost & time this week**. Confirm real costs and hours with the builder, date the review, and mark missing values pending. This requirement is recorded in AGENTS.md; it is not an automated schedule.

Run the matching checks with Node.js (built-in test runner; no install):

```powershell
node --test tests/matcher.test.cjs tests/imports.test.cjs
```

Basic browsing and import need no API key. The importer supports English headers `Title`/`Name`/`place_name`, `URL`/`item_content_url`/`google_maps_url`/`maps_url`, and `Note`/`Notes`; handles quoted commas, newlines, and optional collection descriptions; and skips non-Maps URLs and duplicate links. Upload an individual CSV (not the ZIP), up to 2 MB and 2,000 rows. Different short and full URLs for the same place may still need manual deduplication. Actual export variations need checking against your first real file.

Long-term: investigate Google's [Data Portability API](https://developers.google.com/data-portability/schema-reference/save) for consent-based importing and refreshed copies. This requires app verification and eligibility; Google's [current supported-country list](https://support.google.com/accounts/answer/14452558) excludes the US. Do not promise universal access, complete coverage of every Maps list, or continuous sync. CSV import remains the fallback.

Clone **your own repository** and ask your coding agent to document the exact install and run commands here and in `AGENTS.md`.

```bash
git clone https://github.com/building-with-ai-f26/<your-repo-name>.git
cd <your-repo-name>
```

If your app needs API keys, use a local environment file such as `.env`. Keep private keys out of source code, browser code, screenshots, and commits. The template ignores `.env`; `.env.example` contains placeholders only.

## Local AI conversation

Set `OPENROUTER_API_KEY` in your private `.env` and restart `python server.py --port 8001`. Never paste the key into chat or commit it. `OPENROUTER_MODEL` defaults to `openai/gpt-4o-mini` and can be changed locally. Google enrichment uses `GOOGLE_MAPS_API_KEY`, with reviews controlled by `GOOGLE_PLACES_REVIEWS_ENABLED`.

Describe an occasion in The plan and send follow-ups to revise it. Conversation history stays in memory until reset or reload. Each send shares the active guide's names, notes, recorded details, tags and review-derived hints with OpenRouter and its model provider. Each plan retrieves likely saved candidates, fetches their available Google details, and ranks them using descriptions, price ranges and a limited review sample. Photos are excluded from AI requests. AI reasons can be inaccurate and require evaluation. A missing key shows a setup message. Static GitHub Pages cannot run these server features.

Run `python usage.py` for private project-report request counts, provider-reported AI tokens and costs. The ledger under `.local/` is Git-ignored and excludes conversation and place contents. Missing billing values stay pending. Run `python -m unittest discover -s tests -p 'test_*.py'` for Python checks and `node --test tests/matcher.test.cjs tests/imports.test.cjs tests/google.test.cjs` for JavaScript checks.

## Private accounts

The local Python server uses Supabase Auth and owner-only database policies for profiles and account guides. Sign-up and sign-in use email and password. Supabase may require email confirmation before sign-in. The local server holds access and refresh tokens in memory, with an HttpOnly, SameSite cookie in the browser. Restarting the server requires signing in again. Production deployment will need HTTPS, secure cookies and a durable session strategy.

1. Create a Supabase project with the Data API enabled. Enable automatic RLS and disable automatic exposure of new tables.
2. Run `supabase/migrations/20261110_private_guides.sql` once in that project's SQL Editor. It creates private profiles, private guides and a revision-checked save function. In Authentication → URL Configuration, set Site URL to `http://127.0.0.1:8001/prototype/` for local confirmation emails.
3. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in your private `.env`, then restart `python server.py --port 8001`. Use the publishable key. Elevated secret and service-role keys are rejected.
4. In Inner Table., open Sign in and create an account. Complete email confirmation if requested, then sign in and save your display name and username.
5. Choose Copy device places to my account to upload this browser's guide. Exact duplicate Maps links keep existing account entries. The device guide remains available through My account. Account changes save automatically. Failed changes remain pending in the page and can be exported as a backup or retried. Conflicting edits require reloading the account guide after preserving pending changes.

Google sign-in is also supported through the local server. In Google Auth Platform, create a Web application OAuth client with `https://<project-ref>.supabase.co/auth/v1/callback` as its authorized redirect URI. Enter its client ID and secret only in Supabase Authentication's Google provider settings and enable the provider. Add `http://127.0.0.1:8001/api/account/google/callback` to Supabase's redirect allowlist (add the localhost equivalent only if used). While the Google app is in testing, add permitted test accounts in its Audience settings. Request only basic profile and email scopes. This login does not grant access to Google Maps saves.

Choose Continue with Google in the account panel. The server uses PKCE, a ten-minute single-use login attempt and an HttpOnly callback cookie; the authorization code is exchanged server-side. Google credentials do not belong in source files or browser storage. Restarting the server invalidates unfinished login attempts and existing local sessions.

Use `node --test tests/accounts.test.cjs` and `python -m unittest discover -s tests -p test_accounts.py` for account regressions. Run `supabase/tests/private_guides.sql` in SQL Editor for a live ownership and revision check. Its fictional records roll back in the same transaction. Following, friend access and guide sharing are the next milestone. Current profiles and guides permit owner access only.
