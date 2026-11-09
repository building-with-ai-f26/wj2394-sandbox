# Inner Table.

> **One-line pitch:** Where would my friend book? Find places for the occasion, with recommendations from people you trust. Starting in NYC.

- **Builder:** [Your Name] (`@github-handle`)
- **Pod:** 9
- **Product Page & Living PRD:** [Add your GitHub Pages URL]
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

Your places are kept in this browser's local storage, not uploaded or written into the repository. Use **Export backup** and **Restore backup** to keep a copy. Use the same browser and origin (`127.0.0.1:8000`) to return to your data. Private browsing or clearing site data can remove it. Storage errors are shown in My places.

Discover keeps your reviewed places separate from the optional 12-entry fictional sample guide. This version does not call an AI model, provide accounts or private sharing, or connect to Google. **Connect Google** is a clearly labeled future entry point, not an authorization button.

From the repository root, run:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/prototype/` for the app, or `http://127.0.0.1:8000/docs/` for the class product page. Stop the server with Ctrl+C. Do not use the repository-root server as a public deployment: it is for local development only.

Run the matching checks with Node.js (built-in test runner; no install):

```powershell
node --test tests/matcher.test.cjs tests/imports.test.cjs
```

No API key is needed. The importer supports English headers `Title`/`Name`/`place_name`, `URL`/`item_content_url`/`google_maps_url`/`maps_url`, and `Note`/`Notes`; handles quoted commas, newlines, and optional collection descriptions; and skips non-Maps URLs and duplicate links. Upload an individual CSV (not the ZIP), up to 2 MB and 2,000 rows. Different short and full URLs for the same place may still need manual deduplication. Actual export variations need checking against your first real file.

Long-term: investigate Google's [Data Portability API](https://developers.google.com/data-portability/schema-reference/save) for consent-based importing and refreshed copies. This requires app verification and eligibility; Google's [current supported-country list](https://support.google.com/accounts/answer/14452558) excludes the US. Do not promise universal access, complete coverage of every Maps list, or continuous sync. CSV import remains the fallback.

Clone **your own repository** and ask your coding agent to document the exact install and run commands here and in `AGENTS.md`.

```bash
git clone https://github.com/building-with-ai-f26/<your-repo-name>.git
cd <your-repo-name>
```

If your app needs API keys, use a local environment file such as `.env`. Keep private keys out of source code, browser code, screenshots, and commits. The template ignores `.env`; `.env.example` contains placeholders only.
