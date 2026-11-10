# AGENTS.md — Coding Agent Operating Manual

> Give this file to your coding agent and check that it is using these instructions. Keep the stack, commands, and ground rules current.

## 1. Project Overview
- **What this repo builds:** Inner Table. is an occasion-based place guide built around recommendations from people you trust, starting in NYC. Build 1 supports personal Maps links, local Takeout CSV imports with review, recommendations across all categories (including uncategorized pins), and a separate fictional sample guide. Other cities are a future direction.
- **Primary user & core workflow:** [See the living PRD in `docs/index.html`]
- **Tech stack:** Plain HTML/CSS/JavaScript; Python standard-library local server; Node.js built-in test runner. No third-party dependencies. Optional Google Places, OpenRouter and Supabase APIs.

## 2. Commands
- **Install dependencies:** None. Python and Node.js must be available.
- **Run locally:** `python server.py --port 8001`, then open `http://127.0.0.1:8001/prototype/`. Local development only; do not expose the repository-root server publicly.
- **Run deterministic tests:** `node --test tests/matcher.test.cjs tests/imports.test.cjs tests/google.test.cjs tests/accounts.test.cjs`
- **Python checks:** `python -m unittest discover -s tests -p "test_*.py"`. Private report usage summary through `python usage.py`.
- **Run model evals:** Not applicable for Build 1; matching is rule-based. Build 4 track not selected yet.

## 3. Non-Negotiable Engineering Rules

Device imports stay in browser local storage until the user explicitly copies them to their private Supabase account. Account guides use owner-only RLS policies. Never copy personal data into tracked fixtures, logs or screenshots without explicit instruction. Connect Google is future work, not an implemented OAuth flow. Imported places enter the guide automatically; do not require a review of every entry. Keep guide inclusion separate from personal endorsement and visit status. Users can edit all statuses and hide/show a place anytime. Label inferred tags and saved-list provenance; never imply a visit, verified suitability, or endorsement from an import. Category, visit, note, and neighborhood are optional. Never reinstate a restaurant-only gate. Filters use recorded details or explicitly labeled tag suggestions, not invented facts.
1. **Plan before coding:** Before touching multiple files, propose a brief plan and wait for approval.
2. **Small batches:** Make small, focused changes that can be reviewed and explained by a human in a single Pull Request.
3. **Explainability:** Avoid unnecessary abstractions or dependencies. Help the human builder understand the main components, what changed, why it matters, what could break, and how it was checked.
4. **Verify changes:** Run relevant checks. For a reproducible logic bug, use a failing test to demonstrate the fix when practical. Record manual checks and known limitations; follow the selected Build 4 evaluation track.
5. **Zero secrets in code:** Never hardcode API keys, tokens, or credentials. Always read from environment variables (`.env`) and update `.env.example` when new variables are needed.
6. **Stop when looping:** If a fix fails twice in a row, stop, summarize what failed, and ask the human before trying a third approach.

## 4. Weekly reporting requirement
- Before **12:00 noon every Monday in America/New_York**, update **Unit Economics & Analytics Snapshot (Updated Weekly)** and the active build's **Cost & time this week** in `docs/index.html`.
- Record the review date. Use actual builder-confirmed spend and hours and measured analytics when available. Ask for missing figures; mark them pending rather than guessing or treating unknown values as zero. Distinguish runtime API costs from coding tools/subscriptions and total build spend. Preserve earlier weeks' actual records.
- Keep prototype screenshot evidence current when the UI changes. Use fictional sample data unless the builder explicitly authorizes publishing personal data.
- This is a persistent project instruction, not a scheduled background task. No scheduler is configured by this file.
- Starting with the next reporting period (Build 2, due November 16, 2026), automatically record observed project work sessions in the build journal while working with the builder. Capture actual clock start/end times, corroborate with available message/commit timestamps, avoid overlapping/double-counted intervals, and label time totals as estimates rather than measured attention. Do not claim to observe GitHub tab time or count long gaps as continuous work. Preserve evidence and limitations for each weekly estimate. This does not configure unattended monitoring or a Monday scheduler.
- Builder reports using ChatGPT Plus. Keep subscription allocation separate from runtime API spend, using an explicitly stated allocation method and estimated/pre-tax labels until the actual bill is confirmed. Builder approved the Build 1 estimates on November 9: approximately 5 hours from the commit activity window, $4.62 weekly subscription allocation assuming $20/month ($20 × 12 ÷ 52), and $0 runtime API cost. These are approved estimates, not verified actual billings or measured attention. Use the approved allocation method in future reports unless the builder changes it.
