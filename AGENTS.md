# AGENTS.md — Coding Agent Operating Manual

> Give this file to your coding agent and check that it is using these instructions. Keep the stack, commands, and ground rules current.

## 1. Project Overview
- **What this repo builds:** Inner Table. is an occasion-based place guide built around recommendations from people you trust, starting in NYC. Build 1 supports personal Maps links, local Takeout CSV imports with review, recommendations across all categories (including uncategorized pins), and a separate fictional sample guide. Other cities are a future direction.
- **Primary user & core workflow:** [See the living PRD in `docs/index.html`]
- **Tech stack:** Plain HTML/CSS/JavaScript; Python static server for local development; Node.js built-in test runner. No dependencies or external APIs.

## 2. Commands
- **Install dependencies:** None. Python and Node.js must be available.
- **Run locally:** `python -m http.server 8000 --bind 127.0.0.1`, then open `http://127.0.0.1:8000/prototype/`. Local development only; do not expose the repository-root server publicly.
- **Run deterministic tests:** `node --test tests/matcher.test.cjs tests/imports.test.cjs`
- **Run model evals:** Not applicable for Build 1; matching is rule-based. Build 4 track not selected yet.

## 3. Non-Negotiable Engineering Rules

Personal imported data stays in browser local storage; never copy it into tracked fixtures, logs, or screenshots without explicit instruction. Connect Google is future work, not an implemented OAuth flow. Imported places enter the guide automatically; do not require a review of every entry. Keep guide inclusion separate from personal endorsement and visit status. Users can edit all statuses and hide/show a place anytime. Label inferred tags and saved-list provenance; never imply a visit, verified suitability, or endorsement from an import. Category, visit, note, and neighborhood are optional. Never reinstate a restaurant-only gate. Filters use recorded details or explicitly labeled tag suggestions, not invented facts.
1. **Plan before coding:** Before touching multiple files, propose a brief plan and wait for approval.
2. **Small batches:** Make small, focused changes that can be reviewed and explained by a human in a single Pull Request.
3. **Explainability:** Avoid unnecessary abstractions or dependencies. Help the human builder understand the main components, what changed, why it matters, what could break, and how it was checked.
4. **Verify changes:** Run relevant checks. For a reproducible logic bug, use a failing test to demonstrate the fix when practical. Record manual checks and known limitations; follow the selected Build 4 evaluation track.
5. **Zero secrets in code:** Never hardcode API keys, tokens, or credentials. Always read from environment variables (`.env`) and update `.env.example` when new variables are needed.
6. **Stop when looping:** If a fix fails twice in a row, stop, summarize what failed, and ask the human before trying a third approach.
