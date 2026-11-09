# Build 1: Intent.md & Throwaway Prototype

Optional working notes. Publish your required build log on `docs/index.html`; no separate journal submission is required.

**Build due:** Monday, Nov 9, 2026 at 12:00 PM (Noon)

---

## 1. What you made
- **PRs / Commits shipped:** Builder approved pushing the current Build 1 checkpoint on November 9. Development paused after this checkpoint; no new hosted-site deployment requested.
- **Product Page URL / local demo evidence:** Serve locally with `python -m http.server 8000 --bind 127.0.0.1`. App: `http://127.0.0.1:8000/docs/prototype/`; class page: `http://127.0.0.1:8000/docs/`. Visually reviewed screenshot: `docs/assets/build-1-prototype.png`, embedded in the Product Showcase. Public class page: https://building-with-ai-f26.github.io/wj2394-sandbox/ .
- **Summary of what works now:** Local place guide with Discover and My places, Maps-link entry, Saved-list CSV import with automatic inclusion, editable statuses and endorsements, inferred occasion tags, hide/show and Show all in guide, browser persistence, backup export/restore, and rule-based search. All categories are eligible; visits, notes, and neighborhoods are optional. A separate 12-entry fictional dataset demonstrates the experience. Google reviews, categories, and photos are not fetched yet.

### Next improvements · deferred at builder's request
- Use Google review content alongside personal notes to improve occasion matching, keeping review-derived evidence separate from personal judgment. Investigate supported access, attribution, costs, and limits before implementation.
- Enrich imported pins with their Google Maps place categories so users do not have to categorize entries manually. Resolve the correct place before applying a category and preserve unknown/ambiguous cases.
- Add real place photos to recommendation cards for a more direct visual experience, with supported sourcing and attribution. Current colored card headers are decorative, not venue photos.
- Support both Takeout Saved-list CSVs and Maps (your places) starred-place JSON/GeoJSON; preserve list provenance and deduplicate across formats. Direct Google permission-based importing and multi-city discovery remain longer-term goals.
- Validate against a real saved-list export and actual users. These items are not implemented in this checkpoint.

### Change record · November 8, 2026
- Builder approved a small local prototype before expanding to social features.
- Added `prototype/` for app UI, fictional data, and matching rules; `tests/matcher.test.cjs` covers core filtering behavior.
- Updated the class pitch, PRD, and Build 1 status without replacing the class layout or later build sections. Added exact local commands to README and AGENTS.
- Sources: builder's product description. No Google Maps import or Google reviews used. No claims of real restaurant prices, availability, or user validation.
- Next: builder reviews the experience, supplies a small set of saved NYC places and personal notes, then tests it with friends. Costs, hours, and course learning reflections below remain for the builder to fill in.
- Verification: all 8 matching tests passed; JavaScript syntax and Git whitespace checks passed. Local HTTP smoke check returned 200 for the prototype, all four app assets, and the class page. Browser layout, mobile interaction, and screenshot evidence remain unverified in this session.
- Naming: builder confirmed the exact product name is **Inner Table.**, including the period; updated the visible wordmarks, page titles, and project documents.

### Change record · November 9, 2026
- Builder preferred the existing hosted Inner Table design. Restyled the local app using its cream background, charcoal hero, burgundy accents, compact filters, and rounded cards. Hosted site was not modified.
- Added Discover / My places navigation; personal Maps-link entry; local CSV import preview with duplicate and skipped-row counts; a review queue; category, visit, note, neighborhood, occasion tag, budget, and endorsement editing; remove; local persistence; and JSON backup export/restore.
- Direct imports start unclassified and unvisited. Personal recommendations require explicit review and remain separate from the fictional sample guide. No real data has been supplied yet.
- Reserved a future Connect Google portal. Investigated official Data Portability API docs: saved collections have CSV title/URL/note fields; Google authorization requires verification and eligible accounts. Current country availability excludes the US. No OAuth or automatic refresh implemented.
- Sources: https://developers.google.com/data-portability/schema-reference/save and https://support.google.com/accounts/answer/14452558 .
- Verification: all 15 matching/import unit tests passed, covering quoted CSV data, duplicate links, unsupported URLs, malformed input, backup validation, and reviewed recommendation eligibility. JavaScript syntax and Git whitespace checks passed. Browser checks recorded below when complete.
- Limits: importer supports the documented English-header CSV variants, not every Takeout format or ZIP files. Equivalent short and full Maps links may need manual deduplication. Real export testing, user feedback, costs, and hours remain pending. No commit, push, or deployment.
- Future import requirement confirmed by builder: support BOTH Google Takeout **Saved** list CSVs and **Maps (your places)** starred-place JSON/GeoJSON exports. Update export instructions to select both categories; inspect real samples, preserve source/list provenance, and deduplicate across formats. Current implementation supports Saved-list CSVs only; starred-place import is pending.
- Geographic direction confirmed by builder: the long-term product supports recommendations across all cities represented by users' saved or visited places, not NYC exclusively. NYC remains the first prototype's recommendation scope. Future imports should preserve places outside NYC for later city-based discovery, with explicit city/country fields rather than relying on neighborhood alone. Saved and visited remain distinct; a map pin does not prove a visit or endorsement.
- Browser verification: headless Chrome passed sample filtering, CSV preview/confirmation, review-to-recommendation, personal-guide search, and persistence after reload. At 390px, My places had no horizontal overflow. Inspected desktop Discover, desktop My places, and narrow My places screenshots; no runtime exceptions observed. Test data was synthetic and used an isolated temporary browser profile.

### Recommendation eligibility correction · November 9, 2026
- Builder clarified that visiting a place is not required to recommend it. Visit status is optional context visible to people browsing recommendations. Implemented Been there / Want to try / Not specified; new imports default to Not specified rather than inferring intent to visit.
- Removed visit, personal-note, and neighborhood requirements from recommendation validation and matching. Explicit restaurant endorsement is still required for this prototype's restaurant guide. Optional details remain unknown when absent; filters require actual recorded tags, neighborhood, or price rather than inventing evidence.
- Cards show visit status and disclose missing notes/neighborhoods. Updated UI help, backup validation, sample endorsement fields, README, AGENTS, and living PRD. Existing saved visit statuses are preserved.
- Added regression checks and demonstrated the old gates failing before implementation. All 17 unit tests passed after the fix; syntax and whitespace checks passed. Headless Chrome verified recommending an imported restaurant with no visit, note, or neighborhood; all three visit-status badges; persistence after reload; existing sample filtering and CSV review; and no runtime exceptions. My places remained within a 390px viewport. No push or deployment.

### Category eligibility correction · November 9, 2026
- Builder clarified that recommendations can include any category, not only restaurants. Removed category restrictions from validation and matching; explicit endorsement is sufficient. Uncategorized pins are eligible too. Optional visit status, notes, and neighborhood remain optional; NYC remains the initial scope.
- Cards now display the recorded category. Added Shop and Nightclub editor/backup support alongside Restaurant, Café, Bar, Other, and Uncategorized. Changed restaurant-only UI copy and updated the living PRD, README, and agent rules.
- Explicit dinner, coffee, bar, shopping, and nightlife search terms filter by the recorded category; general browsing covers all recommended places. Saved-only entries remain separate. Starred-place JSON/GeoJSON import and multi-city discovery remain future work.
- Verification: regression tests first demonstrated the restaurant-only restriction; all 18 unit tests passed after the change. Syntax and whitespace checks passed. Headless Chrome verified recommending, displaying, and reloading all seven supported categories (including Uncategorized), with optional visit status, note, and neighborhood unchanged; existing CSV preview/confirm, filters, and narrow My places checks also passed without runtime exceptions. No commit, push, or deployment.

### Automatic import preparation · November 9, 2026
- Builder emphasized that reviewing every imported pin defeats the time-saving goal and that statuses should be editable anytime. After the bulk import preview, new imports now enter Discover automatically. Guide inclusion is separate from personal endorsement; visit status stays Not specified until edited. Existing records retain their prior visibility on load, rather than silently re-including hidden/saved-only places.
- Added editable inclusion and personal endorsement controls plus one-click hide/show. All categories remain eligible. Conservative keyword rules suggest tags from saved notes, list names (export column or filename), and export tags. Suggested tags and saved-list provenance are labeled, preserved in backups, and editable. Categories, prices, neighborhoods, and visits are not invented.
- Limits: this prepares imported data locally; it does not fetch Google details or reviews. Entries with sparse data can appear in general browsing, but will not match filters whose required details are missing. Direct Google connection and starred-place JSON/GeoJSON support remain future work. No actual user saved-list data supplied yet.
- Verification: new regression checks demonstrated the old mandatory-review behavior, then all 21 unit tests passed. Headless Chrome verified immediate search after import, inferred/source labels, hide/show, editable statuses, persistence after reload for all categories, CSV preview/confirm, and narrow My places layout without runtime errors. Syntax and whitespace checks passed. No commit, push, or deployment.

### Show all in guide · November 9, 2026
- Added a Show all in guide button beside Your saved places in My places. It includes all saved entries without changing visits, endorsements, tags, notes, or other details. Disabled when no entries are hidden. Existing Discover filters still apply.
- Bulk visibility persists in browser storage, and an open editor's inclusion checkbox stays synchronized. Browser checks verified restoring a hidden imported place, unchanged visit/endorsement, persistence after reload, and disabled state once all places are included. All 21 unit tests, JavaScript syntax, and whitespace checks passed. No push or deployment.

## 2. Metacognition ("Learn with AI"): Terminal, Filesystem & Git

### Build 1 evidence and Pages links · November 9, 2026
- Builder approved embedding a screenshot and fixing GitHub Pages prototype links. Confirmed Pages serves only `main:/docs`; the old link led to a prototype outside the published folder. Moved the canonical app to `docs/prototype/`, fixed return links and test imports, and updated local run URLs.
- Captured and visually inspected a 1200×1100 local Discover screenshot using fictional sample places, with no personal saved data; embedded it in the class page. Functional browser checks and all 21 unit tests passed after relocation. Class-page image and prototype links checked separately before publication.
- Added a persistent reporting rule to AGENTS and README: update the economics/analytics snapshot and active build's cost/time before noon Monday in America/New_York. No background schedule configured. Snapshot reviewed November 9: actual build spend/hours pending builder input, no analytics installed, and $0 external API cost per run for this static version. Unknowns replaced misleading zero placeholders.

- **Terminus completed (`The Crypt` & `The Vanished Keeper`):** `[ ] Yes`
- **3 diagnostic questions your AI tutor asked about how your prototype runs (and your answers in your own words):**
  1. 
  2. 
  3. 
- **What finally clicked about the terminal, local files, or Git:** 

## 3. What the agent did
- **Agent(s) & Model(s) used:** 
- **How you briefed/directed it (key prompts or `AGENTS.md` updates):** 
- **Where you had to step in, edit by hand, or reset context:** 

## 4. What didn't work
- **Bugs, agent loops, or broken assumptions:** 
- **How you diagnosed and fixed (or rolled back) them:** 

## 5. What it cost
- **Agent / Token spend this week:** `$___`
- **Hosting / API runtime spend this week:** `$___`
- **Your hours spent this week:** `___ hrs`
- **Cumulative project spend to date:** `$___`

## 6. Pod Critique Sign-off
- **Tested by podmate(s):** 
- **Key feedback to address next:**
