# Build 2: Plan.md & Smallest Local Version & PostHog

Optional working notes. Publish your required build log on `docs/index.html`; no separate journal submission is required.

**Build due:** Monday, Nov 16, 2026 at 12:00 PM (Noon)

---

## 1. What you made

### Private-account milestone · November 10, 2026

Created the builder's free Supabase organization and project, with automatic RLS enabled and automatic exposure of new tables disabled. Added owner-only profiles and guides, revision-checked guide saves, email/password sign-up and sign-in, server-memory sessions, private profile editing, and an explicit copy-device-guide action. Copies preserve existing account entries for duplicate Maps links. Device and account guides remain distinct, with automatic account saves, retry controls, export support and stale-edit conflict handling.

Applied the SQL migration to the live project. Live SQL checks verified owner isolation and stale-revision rejection, using fictional users inside a rolled-back transaction. No real guide migration has been performed by the agent. Verified the live Auth connection, enabled email sign-in, anonymous data denial and the local session endpoint. Browser inspection confirmed the sign-in form and 76 device places. End-to-end sign-up, email confirmation and the builder's account copy await the builder's own credential entry.

Checks passed 31 JavaScript tests and 23 Python tests. Captured `docs/assets/build-2-accounts.png` from an empty guide with blank credential fields. Kept the project connection settings in the ignored `.env`. Production HTTPS/session hosting and follower access remain future work. Supabase's selected plan is Free, while actual weekly service billing remains pending confirmation. The final clock review was 2:01 PM America/New_York. The start time for this multi-turn setup was not captured, so its reconciled duration remains pending and no continuous attention total is inferred.

Removed the Discover neighborhood, budget and recommendation-source dropdowns at the builder's request. The plan conversation now receives location, budget and occasion directly from messages and searches the real saved guide. Removed dropdown-dependent event handlers and card filtering. Syntax checks and browser inspection verified the simplified composer and 76 stored places. No API test calls were required for this presentation change.
- **PRs / Commits shipped:** 
- **Product Page URL / local demo evidence:** 
- **Summary of what works now:** 

## 2. Metacognition ("Learn with AI"): Requests, APIs, `.env` & Analytics

### Something I learned · November 10, 2026
I learned why Inner Table needs Google Cloud setup to add categories, photos, and review information to imported places. A saved-list export mainly gives the app names, links, and sometimes notes; it does not automatically include all the information I want for recommendations. The Places API gives the product access to public place information, and the project's billing account covers API usage. This is something I set up as the builder, not something every user should have to do. Users should be able to import their saves and use the product without seeing API keys or billing settings.

I also learned that public place information and private Google Maps saves are two different connections. Setting up the Places API does not give Inner Table access to someone's private saved lists. Importing a file or obtaining supported account permissions is a separate step. API keys and developer setup belong behind the scenes, while the product should give users a simple experience.

- **End-to-end trace of one user action in your app (explaining the main components and data flow):** 
- **3 "What would break if..." questions your AI tutor asked about your architecture (and your answers):**
  1. 
  2. 
  3. 

## 3. What the agent did

### Conversational plan prototype · November 10, 2026

Added a multi-turn plan composer and local OpenRouter endpoint. The configurable model defaults to `openai/gpt-4o-mini`. Returned cards use only submitted guide IDs, with explicit dropdown budgets and neighborhoods enforced. AI explanations require live quality evaluation. The local key remains a placeholder, so live model replies and charges remain unverified. Provider-reported tokens and costs go to the private ledger. The UI discloses guide-summary transmission.

Checks passed 27 JavaScript tests and 14 Python tests, including mocked follow-ups, unknown-ID rejection and malformed replies. Browser inspection confirmed the composer and 76 saved places. The live loopback check remained unverified after its execution request was rejected. Personal screenshots were excluded.

Clock evidence spans 11:50 AM to 12:12 PM America/New_York. An approximately 18-minute browser-tool wait is excluded from work-time estimation. Reconciled active duration remains pending.
- **Agent(s) & Model(s) used:** 
- **How you briefed/directed it (key prompts or `AGENTS.md` updates):** 
- **Where you had to step in, edit by hand, or reset context:** 

## 4. What didn't work

### Confirmation redirect fix · November 10, 2026

The builder's email confirmation reached an unavailable localhost address. Supabase still had its default Site URL, `http://localhost:3000`. Changed it to the active local prototype URL and verified persistence after reloading the dashboard. Added a confirmation-return notice and removal of auth tokens from the URL fragment before displaying sign-in. Four targeted account UI tests passed, including the new callback regression. The final checkpoint passed all 55 local tests. The builder's real sign-in and migration remain pending. This work window was first clock-observed at 2:05 PM America/New_York.

### Japanese follow-up regression · November 10, 2026

An empty candidate shortlist incorrectly reached the empty-guide reply. Google matching also required exact names, blocking saved venues whose API names differed. Added matching by the Maps feature identifier embedded in saved links, a dedicated empty-candidate response, and explicit cuisine revision instructions. A live test exposed a Korean substitution in Japanese results, so final ranking now checks Japanese evidence in supplied category, description or venue name.

Browser verification on the existing guide returned two Japanese recommendations with Google photos, categories, price ranges and review samples. Four candidates were checked. All 76 records remained available. No personal names, notes or screenshots were added to tracked evidence. Targeted checks passed 7 Google utility tests and 5 planner tests. Google and OpenRouter usage is recorded privately.

Observed work window was 12:59–1:05 PM America/New_York, approximately six minutes of estimated session time including tool waits. This is an estimate of the observed interaction window, with no GitHub tab time inferred. Add this interval once when reconciling the week's hours.

Google access was restored on November 10 after the builder selected None for application restrictions. A live public-venue check successfully fetched category, address, editorial description, price range and five reviews, then produced one AI recommendation grounded in that supplied venue. Google and OpenRouter calls were recorded in the private usage ledger. Verification used a public test venue rather than the builder's saved records. Application IP restriction is currently disabled by the builder's choice.

### Google evidence gap · November 10, 2026

Builder reported repeated empty recommendations. Diagnosis found that enrichment covered a small initial batch, fetched details disappeared on reload, and AI ranking received only coarse review tags without descriptions or price ranges. Added candidate retrieval before Google lookup, followed by final AI ranking with available Google category, address, description, price range and review sample. Lookup coverage and failures are shown explicitly. Google content stays transient and the disclosure now describes the review sample sent for ranking.

Checks passed 27 JavaScript tests and 15 Python tests. A live OpenRouter candidate lookup succeeded using a public venue as test data. Google then rejected the live search with HTTP 403, reason `ACCESS_DENIED`, and message `Permission denied on the service.` End-to-end Google ranking remains unverified until Cloud access is corrected. Minimal diagnostic calls outside the app ledger also occurred and must be reconciled against actual Google billing. No personal place data was copied into this journal.
- **Bugs, agent loops, or broken assumptions:** 
- **How you diagnosed and fixed (or rolled back) them:** 

## 5. What it cost

Track OpenRouter and Google Maps separately in each weekly report. OpenRouter uses provider-reported prompt/completion tokens and request costs when returned. Google Maps uses recorded operation counts and confirmed Cloud billing charges. Missing values remain pending. Keep these runtime costs separate from the approved coding subscription allocation.

OpenRouter connection was confirmed with one successful live request using a fictional place on November 10. The local server was restarted with the configured key. A preceding locally blocked attempt has no provider usage and must not erase the successful request's recorded tokens or cost. The live check validates connectivity, while recommendation quality over the real guide still needs review.

### Usage review · November 10, 2026, 11:42 AM America/New_York

- The existing local guide retained 76 places after five received Google categories, photos, and review-derived suggestions. Personal place data and screenshots were excluded from repository evidence. Suggestions currently use keyword rules. AI interpretation and automatic private Maps access remain pending.
- Private report tracking lives in the Git-ignored `.local/usage.jsonl`. Run `python usage.py` for a summary. Recorded metadata excludes place names, notes, review text, and credentials.
- The ledger contained 19 attempts, including 18 successes and one locally blocked attempt. Counts were 7 searches, 6 details requests, and 6 photo requests. A preliminary key check predates instrumentation. Google charges remain pending billing confirmation.
- App AI tokens remain pending provider integration. Exact project-level coding-agent tokens are unavailable. The observed account-wide Codex allowance snapshot was 34% five-hour and 29% weekly. These percentages do not establish project tokens or costs.
- Continue the approved estimated, pre-tax weekly subscription allocation of $4.62, calculated as $20 × 12 ÷ 52. Record runtime charges separately once confirmed.
- This continuation's end was observed at 11:42 AM. Its earlier start was not retained across context compaction, so this entry adds no duration. Weekly hours remain pending reconciliation with observed sessions and commit timestamps. Unobserved gaps and GitHub tab time are excluded.
- Checks passed for 27 JavaScript tests and 2 usage-log tests. The earlier server suite passed 9 tests. Browser verification used the existing guide without publishing its contents.
- **Agent / Token spend this week:** `$___`
- **Hosting / API runtime spend this week:** `$___`
- **Your hours spent this week:** `___ hrs`
- **Cumulative project spend to date:** `$___`

## Next build priorities approved by the builder

Add accounts, profiles, following and guide permissions. Start with private profiles and approved followers. The intended flow is sign in, import places into an account, request access to a friend's guide, choose whose taste to search, and describe a plan. Results should identify who saved or endorsed each place, their notes and optional visit status. Support hiding individual places and revoking a follower's access. Implement backend authentication, a database and migration from existing browser guides before offering this social workflow.

## 6. Pod Critique Sign-off
- **Tested by podmate(s):** 
- **Key feedback to address next:**
