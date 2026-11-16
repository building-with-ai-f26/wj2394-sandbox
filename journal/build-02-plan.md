# Build 2: Plan.md & Smallest Local Version & PostHog

Optional working notes. Publish your required build log on `docs/index.html`; no separate journal submission is required.

**Build due:** Monday, Nov 16, 2026 at 12:00 PM (Noon)

---

## 1. What you made

### Product-page and analytics review · November 16, 2026

The builder approved preparing the audit fixes for review before pushing. Updated the class product page to PRD v2 with the current chat workflow, shared-list import, Google evidence, private accounts and approved followers. Moved the phone-layout screenshot into the showcase and retained the Build 1 image in its historical log. Corrected the local server instructions and described the static Pages preview and backend hosting requirement. Added visible PostHog recording notices, a repository link and a PostHog insight screenshot cropped to exclude browser tabs and bookmarks. Kept missing weekly totals pending.

Read the professor's November 15 Build 2 email and checked the Icerynk assignment. The published report's existing links, section anchors and prototype assets passed the read-only audit. The published analytics loader and generated configuration were absent. The prepared Actions workflow must be reviewed, published and selected as the Pages build source before public analytics can be verified. No push or Pages settings change was made during this review.

PostHog inspection for November 9 through November 16 at 9:33 AM New York time found 31 prototype pageviews, 18 fixed-control clicks, 92 view-open events, nine form submissions and seven recordings, all local testing. Corrected the existing saved funnel from the unused autocapture event to `control_clicked`. Its returned results and browser chart showed four browser identities reaching a pageview and three reaching a fixed-control click. These identities can include the same builder across browsers. Outside-user testing remains pending. A separate November 16 local report check confirmed one pageview and one `report_link_clicked` event. Public ingestion and visual review of masked recordings remain pending.

The reporting-window ledger contained 106 Google requests, split into 43 searches, 33 details requests and 30 photos, plus 51 OpenRouter requests. Available AI responses recorded 235,476 tokens and a $0.0315225 cost subtotal, with one request missing complete usage. A read-only provider check returned the same $0.0315225 cumulative usage for the configured OpenRouter key. Google Cloud's linked billing overview displayed $0.00 for November 1–16 and warned that costs can arrive more than 24 hours late. Provider key and account totals still need weekly project reconciliation. Google billing account identifiers and credential values were excluded from the report. Other tool charges and total weekly hours remain pending. The estimated pre-tax ChatGPT Plus allocation remains $4.62 per week.

All 39 JavaScript and 31 Python checks passed. Added a report-click regression test that permits fixed analytics labels and excludes link contents. Internal anchors, unique HTML IDs and 19 linked local pages/assets passed. Git whitespace checks passed. Browser preview confirmed the updated report and PRD. The local server needed an unrestricted background launch after its sandboxed process exited. The read-only HTTP link check and OpenRouter usage request required unrestricted reruns after sandbox network failures. The screenshot crop used the available Windows image library after Pillow was unavailable. No package was installed.

Retained clock evidence covers 9:29:15–9:32:44 AM for the earlier audit, 9:36:39–9:39:03 AM for the initial edit/check interval, and 9:46:40–9:49:09 AM for the final review interval, America/New_York. These total approximately eight minutes of partial estimated session coverage including tool waits. The 9:39–9:46 continuation span and other unobserved gaps are excluded. Provider mutation timestamps corroborate the 9:39 checkpoint. This is partial coverage of this work and does not establish total weekly hours or measured attention.

### Beli-inspired design pass · November 12, 2026

The builder supplied eight Beli screenshots and approved a focused design pass. Reworked the prototype with white surfaces, teal controls, compact place rows, quieter metadata, phone bottom navigation and Profile naming. Kept optional visit status, personal endorsement, guide visibility and source labels. Real Google photos use row thumbnails when available. Moved the full AI disclosure into expandable details with its sharing summary visible. Editing now uses a native dialog styled as a phone bottom sheet, with Escape dismissal and browser focus management.

Verified add/save/edit/cancel, Escape, hide/show, Reset and navigation using one fictional place on the separate localhost origin. Checked 320px and 390px phone widths and a 1280px desktop layout. The 390px screen had no horizontal overflow. Captured only fictional or empty screens. A fresh design reviewer judged the supplied evidence ready to ship. All 38 JavaScript checks passed, plus syntax and whitespace checks. Physical phone keyboard behavior remains pending. Final cleanup encountered a stalled browser confirmation, so the fictional localhost sample may remain and the viewport reset could not be confirmed. Browser retries stopped. No personal guide was used in saved evidence.

Clock evidence begins at 4:26:48 PM America/New_York. Work before that retained observation is excluded. The final clock checkpoint was 4:33:36 PM, an approximately seven-minute estimated session interval including tool waits. No Google or OpenRouter calls were initiated for this design pass. Billing and weekly hours remain pending reconciliation.

### Design tools and PostHog · November 12, 2026

Installed Impeccable and the official Mobbin plugin and completed Mobbin OAuth. Mobbin reference access still depends on the builder's plan. Connected PostHog and configured the new project as Inner Table., with America/New_York reporting time, dropped IP addresses, session replay enabled, and console/network recording disabled. Added analytics to both HTML entry points, with fixed event identifiers, private regions blocked, text and inputs masked, and credential callback URLs excluded. Kept browser configuration in the ignored environment file and generated JSON. Prepared a Pages workflow and saved its repository variables. Switching Pages to Actions, review, push and public verification remain pending.

Live PostHog inspection confirmed a local prototype pageview, Reset click and one session recording. These are builder test events. Replay content has not been visually audited. Added two passing privacy regression tests. The existing 36 JavaScript tests also passed. The click check exposed a form method shadowed by the Reset button's ID, and the handler now calls the native form method explicitly. Its browser recheck was interrupted by the active account screen. No Google or OpenRouter calls were needed. PostHog and Mobbin billing totals remain pending confirmation.

Clock evidence spans 3:14:00–3:23:38 PM America/New_York, an approximately ten-minute estimated session interval including tool waits. Setup began before the first retained clock observation, so this is partial coverage. It excludes the earlier recorded 2:49 PM session and unobserved gaps.

### Friends test walkthrough · November 12, 2026

Resumed the existing Friends batch and added a two-browser walkthrough covering pending requests, approval, shared-guide search, hidden entries and revoked access. Updated the class report with the account migration outcome, permission-test results and privacy-safe Friends screenshot. All 36 JavaScript and 25 Python tests passed again. Python HTTP and temporary-file checks required an unrestricted rerun after sandbox permission failures. Git whitespace checks passed. A real two-account interface rehearsal remains pending. Clock observations span 2:49:04–2:49:52 PM America/New_York, an estimated session interval under one minute including tool waits. Earlier unobserved time is excluded. Runtime billing and reconciled weekly hours remain pending.

### Approved followers · November 10, 2026

Added exact-username follow requests, owner approval, cancellation, declining, unfollowing and access revocation. Approval is one-way. Approved friends can open a read-only guide and search it through The plan, with owner identity, personal notes, endorsements and optional visit status shown on cards. Hidden entries are excluded inside the database before returning a shared guide. Raw guide rows remain owner-only. Each friend-guide AI call rechecks permission and uses current authorized personal records. Selected friend data stays in memory, clears on sign-out or lost access and is protected against late responses restoring a previous user's guide.

Applied the sharing migration to Supabase. Live three-account SQL checks passed for pending denial, owner approval, hidden-place filtering, self-approval protection, unrelated-user denial and revocation. All fictional fixtures rolled back. Local checks passed 36 JavaScript tests and 25 Python tests. Running local endpoints rejected anonymous shared-guide reads and friend-guide AI requests. No real followers were approved by the agent. A real two-account interface rehearsal remains pending. Restarted the local server, which requires renewed sign-in because sessions are in memory.

Work on this batch was clock-observed starting at 3:34 PM America/New_York. Record the closing time and reconcile the interval as estimated session time, including tool waits, without inferring continuous attention or GitHub tab activity.

### Private-account milestone · November 10, 2026

Subsequent browser verification confirmed a signed-in account guide containing all 76 places. The builder completed the live sign-in and explicit copy flow. Personal place contents were excluded from repository evidence.

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
