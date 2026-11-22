# Inner Table.

> **One-line pitch:** Where would my friend book? Find places for the occasion, with recommendations from people you trust. Starting in NYC.

- **Builder:** [Your Name] (`@github-handle`)
- **Pod:** 9
- **Product Page & Living PRD:** https://building-with-ai-f26.github.io/wj2394-sandbox/
- **Prototype on GitHub Pages:** https://building-with-ai-f26.github.io/wj2394-sandbox/prototype/
- **App:** local development plus a Render demo being prepared on `codex/public-demo`.

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

Discover searches your visible saved places. **Try sample guide** switches to six clearly labeled fictional examples in page memory. Sample mode resets the conversation on entry and exit. Accounts support profiles, explicit device-to-account copying, and approved-follower access. Automatic Google access to private Maps saves remains future work.

From the repository root, run:

```powershell
python server.py --port 8001
```

Open `http://127.0.0.1:8001/prototype/` for the app, or `http://127.0.0.1:8001/` for the class product page. Stop the server with Ctrl+C. Local mode binds to loopback. Use the explicit hosted mode below behind Render HTTPS for a public demo.

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

## Render demo setup

The approved public demo uses the same Python app on `codex/public-demo`. `render.yaml` describes a free, single-instance service. For manual setup, connect the public repository, select Python 3 and this branch, leave Root Directory empty, set Build Command to `python analytics_config.py`, Start Command to `python server.py`, and Health Check Path to `/healthz`. Disable automatic deployment to keep a review step before publishing.

Set the following values privately in Render environment settings.

- `APP_MODE=public`
- Separate demo `OPENROUTER_API_KEY` and `GOOGLE_MAPS_API_KEY`
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
- `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST=https://us.i.posthog.com`
- `OPENROUTER_MODEL=openai/gpt-4o-mini`
- `GOOGLE_PLACES_MAX_REQUESTS_PER_SESSION=40`
- `GOOGLE_PLACES_REVIEWS_ENABLED=true`

The builder selected separate demo keys with a $2 OpenRouter credit cap. Google project quotas apply across that project, so a separate demo Cloud project gives the hosted demo independent quotas. Set API restrictions to Places API (New) and restrict the key to Render's documented outbound addresses once the service is created. Confirm the key cap and quotas in provider settings before enabling live calls.

Render supplies `PORT` and `RENDER_EXTERNAL_URL`. Hosted mode binds to `0.0.0.0` behind Render HTTPS and requires the configured HTTPS origin. A custom domain requires `APP_PUBLIC_ORIGIN` set to that exact origin. Session cookies use HttpOnly, SameSite=Strict and Secure in hosted mode. The temporary OAuth cookie uses SameSite=Lax. API requests validate Host/Origin before provider calls. The public API allowance is 300 requests per rolling hour overall and 60 per visitor. AI allows 30 provider calls and Google allows 40 requests per running process. A plan normally uses two AI calls. These counters reset on restart. Provider-side controls determine the demo's independent spending limits.

Add the deployed app's exact `https://<service>.onrender.com/api/account/google/callback` to Supabase Authentication's allowed redirect URLs. Retain the local callback entries. Email confirmation links use the Supabase Site URL. For public testing, set it to the hosted `/prototype/` page. Google sign-in creates an app session. Automatic private Maps-save importing remains planned.

Local development continues through `python server.py --port 8001` with `APP_MODE=local` as the default. The developer's private `.env` supplies local values. Render has its own environment settings. Browser places stay on the origin where they were created. Use backup export/restore or explicit account copying to move a guide between origins.

Free Render instances sleep after inactivity and can take about a minute to wake. Restarts clear in-memory sessions, temporary Google details, API counters and the ephemeral usage ledger. Account guides persist in Supabase. Reconcile hosted API costs against provider records because the hosted ledger is temporary.

Before sharing, verify `/healthz`, a sample conversation, a real-place Google lookup, sign-in, device/account switching and follower access. **Try sample guide** uses fictional places in memory, bypasses Google and preserves personal guides. The sample is labeled throughout the UI. Feedback buttons send only fixed Helpful/Not yet control identifiers through the existing masked PostHog setup.

## AI conversation configuration

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

Use `node --test tests/accounts.test.cjs` and `python -m unittest discover -s tests -p "test_*.py"` for account and callback regressions. Run `supabase/tests/private_guides.sql` in SQL Editor for a live ownership and revision check. Its fictional records roll back in the same transaction. Approved following is available after applying the sharing migration below. Raw guide-table access remains owner-only.

## Approved friends

Run `supabase/migrations/20261110_approved_followers.sql` once after the private-account migration. In Friends, enter an exact username to request access. Only the guide owner can approve incoming requests. Approved access is one-way. Owners can decline requests or remove access, and readers can cancel requests or unfollow.

Approved readers receive only places shown in the account guide. Hide place removes an entry from that shared view. The database filters hidden entries before returning a guide. Raw private guide rows remain owner-only, and shared reads use a narrowly scoped database function that checks the approved connection. Profile discovery exposes the display name and exact requested username. Following requests do not send email notifications.

Choose Search guide next to an approved friend to use their places in the plan conversation. Cards identify the guide owner and distinguish personal notes and endorsements from Google hints. Friend-guide data stays in page memory and cannot be edited through My places. Each friend-guide AI request checks approval again and replaces client-submitted personal fields with current authorized database records. Returning to the window also refreshes the selected guide and clears it if permission has ended. Access removal prevents future authorized reads. Information someone already viewed cannot be recalled.

Run `supabase/tests/approved_followers.sql` for pending/approved/revoked access, hidden-place filtering and self-approval protection. All fictional test records roll back. Local checks include `node --test tests/friends.test.cjs` and the account Python suite. The local server still needs to be running for real accounts and AI features. A publicly usable social app will require backend hosting.

### Test with two accounts on one computer

You can act as both people using separate browser sessions. Both connect to the same Supabase project through your running local server.

1. Run `python server.py --port 8001`. Open `http://127.0.0.1:8001/prototype/` in your usual browser and sign in to your existing account. Save a username in My account and ensure your account guide is selected.
2. Open the same URL in another browser or a private window. Create a second account with another email you control, confirm it if prompted, then sign in inside that second browser session and save a different username. If the confirmation link opens your usual browser, return to the second session to sign in there. The second account can have an empty guide.
3. In the second account, open Friends and request the first account's exact username. While the request is pending, Search guide should be unavailable.
4. In the first account, open Friends, choose Refresh requests and approve the second account. Return to the second session, refresh requests and choose Search guide beside the first account. Describe a plan to search their visible saved places.
5. In the first account's My places, hide a place. Return focus to the second window so its selected guide refreshes and confirm that place is excluded.
6. In the first account's Friends, remove the second account's access. Return focus to the second window and confirm the shared guide clears. Another shared-guide request should require approval again.

Keep both sessions on the exact `127.0.0.1` URL above. A server restart requires signing in again. Friends on another computer will need a hosted backend and a public prototype URL to try this themselves.

## Design tools and analytics

Impeccable and the official Mobbin plugin are installed in the builder's Codex setup. Mobbin OAuth sign-in succeeded. Mobbin's reference library requires an eligible paid plan. New skills become available on the next Codex turn.

PostHog's Inner Table. project is connected for analytics review. Set `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` in the ignored `.env`, then run `python analytics_config.py` before serving locally. The generated `docs/analytics-config.json` is ignored by Git. The browser project token is public SDK configuration. Administrative credentials stay outside the site.

Both the report and prototype load `docs/analytics.js` from the HTML head and display a recording notice. Events record pageviews, fixed control names, view names and form identifiers, with `surface` and `environment` identifying report/prototype and local/public traffic. Report buttons send `report_link_clicked` with a fixed `link` value, including `prototype` for the demo. They exclude link URLs and text. The saved PostHog interaction funnel uses `control_clicked`, matching the prototype instrumentation. Session replay masks all text and inputs and blocks private app regions and images. Console and network recording are disabled. Confirmation callback URLs skip analytics.

The `.github/workflows/pages.yml` workflow generates the browser configuration from repository Actions variables `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`, then publishes `docs/`. Pages uses **GitHub Actions**, enabled November 16. After deployments, open the published report, click the demo, and verify report/public pageviews and `report_link_clicked` separately from local prototype events. November 16 verification confirmed report and prototype pageviews, the demo-link click and a public recording. Visual replay masking review remains pending. The local backend still serves account and AI operations.
