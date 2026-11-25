# Build 4: Test.py (Choose Domain Evals or User Replays)

Optional working notes. Publish your required build log on `docs/index.html`; no separate journal submission is required.

**Build due:** Monday, Nov 30, 2026 at 12:00 PM (Noon)

---

## 1. What you made
- **PRs / Commits shipped:** 
- **Product Page URL / local demo evidence:** 
- **Summary of what works now:** 

## 2. Evidence from your chosen track
- **Track A — Domain quality:** 3–4 rubric rules, 10 cases (5 normal, 3 messy, 2 adversarial), before/after results, and one outside target-user review.
- **Track B — User friction:** 3–5 outside users, uncoached attempts and replay findings, fixes to the top three friction points, and before/after evidence.
- **What the evidence changed in PRD v4:** 

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

## November 22 prototype check

Two PostHog replays showed a recent entry through My places → Add a place and an earlier import through a separate section. The editor and private fields were masked. This was a review of setup sessions. The Add a place dialog now offers single-place entry and list import, with a list preview for Takeout CSV and completion counts for both import methods. The separate sample guide uses four public NYC venues and three credited photos.

In Chrome at 390 pixels, the single-place entry, CSV preview and confirmation, duplicate counts, backup restore, and cancellation of a pending request passed. The shared-list success case simulated the server response with public venue data. The tested preview had no Google Places key, so new Google photo requests were outside this browser check. [Current import screen](../docs/assets/build-4-add-a-place.png)

Observed work window on November 22 was approximately 12:36 to 12:55 a.m. America/New_York, based on the session clock and verification timestamps. This is about 19 minutes of elapsed session time, including tool and approval waits. Builder attention and billable time were unmeasured.

### Account preview and model pilot

The configured local preview started at 12:58 a.m. The Google sign-in start endpoint returned the expected loopback callback and Supabase redirected to Google. Account completion awaits the builder’s sign-in. Chrome showed 76 device saves. Their contents were outside the public model pilot.

GPT-4o mini, GPT-4.1 mini, and GPT-6.2 Sol each passed five public sample cases covering venue type, neighborhood, a follow-up, and an unverified strict budget. Median elapsed time per case was 3.03 s, 2.25 s, and 3.63 s, respectively. The OpenRouter usage records for the pilot total $0.0265524. The pilot did not establish a quality gain from a model change.

Retained timestamps cover approximately 12:58–1:06 a.m. New York time, or eight minutes including tool waits. This is an elapsed work-window estimate.

### Place photos and friend-guide verification

The live preview reported 20 of 20 Google Places requests used while checking a missing recommendation image. The prototype now checks imported places within the available allowance, resumes the background scan by position across preview sessions, and puts shortlisted venues ahead of background checks. Place Photos and their references stay in memory. The first link alongside Google Maps opens the matched venue.

Chrome exercised an approved friend-guide fixture with Mercado Little Spain and Tomiño Taberna Gallega. Both photos decoded after ranking, source links preceded photographer links, and details stayed open as photos arrived. The browser run used mock provider responses at 390 and 1100 pixels. The live allowance remained exhausted.

Retained timestamps for photo-queue implementation and verification cover approximately 1:14–1:21 a.m. New York time on November 22, or seven minutes of elapsed time including tool waits.

### Friends and profile fields

Friends now previews an exact username before sending an ID-bound request. Guides, received requests, sent requests and the people with access have dedicated controls. Optional photos are cropped in the browser before upload. The owner and approved readers can fetch the photo and bio, and guide responses contain only a photo indicator.

Chrome used two fictional accounts to save a photo and bio, confirm lookup was read-only, send and approve a request, open the guide, and remove access. The page fit at 320, 390 and 1100 pixels. An isolated PostgreSQL run passed all three SQL suites, including unauthorized reads, one-way approval and revocation. The connected Supabase project was outside the test. [Friends phone screenshot](../docs/assets/build-4-friends.png)

Retained timestamps for this work cover approximately 1:23–1:31 a.m. New York time on November 22, or eight minutes of elapsed time including tool waits.


### Discover and shortlist design review, November 23

Inner Table should feel like a neighborhood guide kept by friends. Discover keeps the personal opening question in the wordmark’s serif style. The guide picker sits above the composer with a visible Find places action. Real, credited venue thumbnails make the occasion examples a short list. Pi informed the opening, Thumbtack the primary action, Beli the compact place rows, and Corner the real photos. Shortlist rows use thin dividers and put the place name, saver and note ahead of the expanded explanation.

My places queues visible saved spots, including manually added ones. Shortlist results have priority over routine scans. Expired photo references and temporary transport failures get a single retry with fresh place details when the allowance permits. Recoverable failures offer Retry photo. The tour records its first display per account in browser storage, honors earlier completion records and has no Profile replay.

Chrome verified a reload partway through the tour, leaving Discover, a different account, and previously seen flags. The saved-place and approved-friend checks used public venue names with mocked Google and account responses. The 60 JavaScript and 40 Python checks passed. Chrome confirmed the layout at 320, 390 and 1100 pixels. Live photo coverage remains open. [Desktop Discover](../docs/assets/build-4-discover.png) · [Phone shortlist](../docs/assets/build-4-shortlist.png)

Observed checkpoints cover approximately 1:52–1:59 p.m. America/New_York, including tool waits. This is an elapsed work-window estimate. The fixture checks spent $0 in runtime provider charges. Builder hours await reconciliation.


### Thumbnail coverage in My places and approved guides, November 23

Every displayed place has a thumbnail slot. Approved readers can browse the friend’s shared places and return to a shortlist. Exact verified venue matches can use credited local photos for Mercado Little Spain, Via Carota, Caffè Dante on MacDougal Street and Brooklyn Bridge Park Pier 1. Displayed venues without a confirmed photo have a labeled tile. Google Text Search can return a photo reference alongside a confirmed venue match, saving a separate details request. A known venue ID gets a photo-only lookup.

Fixtures checked four owner rows and three approved friend rows, including hidden-place exclusion and revocation. Chrome checked 320, 390 and 1100 pixel layouts. [390-pixel preview with Google checks paused](../docs/assets/build-4-thumbnail-coverage.png)

The local preview is running with its app-level Google cap disabled, as requested. Hosted mode requires its existing cap. Six live Google calls across two checks verified a two-request photo for each of Mercado Little Spain, Tomiño Taberna Gallega and Sake Bar Decibel. Private-guide photo coverage and Google charges have yet to be reconciled. Checkpoints cover approximately 2:17–2:25 p.m. New York time, including tool waits.


### Search failure diagnostic, November 24

The hosted shortlist returned a generic 502 after an OpenRouter HTTP rejection. Added a server diagnostic for the upstream status and a fixed error category. Seven planner tests passed, including mocked authentication, payment, rate-limit and provider failures. The diagnostic records only status and the fixed category. Render marked diagnostic revision `38fd057` live and the health check passed.

The approved public sample search returned an OpenRouter 402 at 10:06 a.m. New York time. The builder reported resolving the payment issue. One approved repeat at 10:17 a.m. returned HTTP 200 and shortlisted Sake Bar Decibel. Both requests exercised the public shortlist endpoint. The signed-in friend-guide flow was outside those live checks.

Observed checkpoints cover approximately 9:55–9:56 a.m. New York time, including tool waits.

### Shortlist retrieval and automatic venue details, November 24

An offline fixture reproduced a Japanese-tagged, uncategorized entry being selected for lookup and then removed by the final filter. The shortlist now prioritizes saved and sourced cuisine evidence, checks uncategorized candidates, and uses the same evidence in final ranking. The regression also tests a Korean-only result and a more specific Japanese request with a strict budget. The local default and Render configuration now select GPT‑6.2 Sol for both stages. This change has only been verified with mocked provider responses.

Automatic enrichment covers older saved places, new imports, and visible places in the approved friend guide currently selected. Confirmed imports enter the lookup queue immediately and older saves remain eligible for checks beyond the visible rows. Owner guides remember a queue position in the browser so a later session can continue with available provider capacity. Confirmed Google venue types and sourced public venue facts add category, neighborhood, cuisine and search keywords where evidence is available. Google review text stays in the browser and only labeled keyword hints reach ranking. Existing manual edits take precedence. Verified public facts are saved for the owner, while friend supplements are in memory for the active guide. Paid public web checks are disabled by default pending approval. Automated Yelp extraction was excluded under Yelp’s terms.

The release branch passed 84 JavaScript and 55 Python tests without provider charges. Checks covered both stages of friend-guide chat, source evidence, hidden-row exclusion, manual overrides, and the first confirmed list import. Signed-in guide coverage and comparative model quality await live testing.

Observed verification checkpoints cover approximately 10:26–10:43 a.m. New York time, including tool waits. This is elapsed time. Builder hours await reconciliation.

### Research within saved places, November 24

The hosted demo on `83a3c75` checked zero candidates on Google because Google Places was unconfigured. With the builder’s approval, the existing key was connected and the same revision was redeployed. Render marked it live at 11:19 a.m. New York time. The health endpoint succeeded and the status endpoint reported Google Places configured. A separately approved single live Google lookup from that revision returned Via Carota at 51 Grove Street. Signed-in guide coverage awaits testing.

The local research branch adds tentative retrieval tags for new imports and older saves, and lets official and editorial venue sources corroborate the exact place when Google details are unavailable. Chat considers the entire active guide, includes plausible sparse saved entries for checks, and uses public lunch and group-dining signals, when available, to explain fit. Relevant source links appear under Why it fits. Manual edits and guide permissions take precedence. Paid public web research remains off on the live demo.

The new release passed 91 JavaScript and 61 Python checks with mocked providers. They include an uncategorized Japanese lunch option beyond the first six, a sparse candidate that requires evidence, a festive group-dinner recommendation with a source, a wrong branch, and an unsaved recommendation rejection. Observed work checkpoints span approximately 11:18–11:23 a.m. New York time, including tool waits. This is elapsed time and builder hours await reconciliation.

### Daily demo allowance and owner access, November 24

The local build replaces the rolling demo allowance with 60 API requests per visitor IP and 300 across the demo on each New York calendar date. The final 10 per visitor and 30 overall are reserved for chat and account actions. Supabase stores the counters, and a blocked request reports the interval until midnight. The verified owner account bypasses app-level chat and venue limits. Its usage is counted separately. Sign-in and sign-out retain an independent path when the visitor allowance is exhausted. Hosted configuration and the Supabase migration were pending at this checkpoint.

All 92 JavaScript and 62 Python checks passed offline. An isolated PostgreSQL regression checked the reserves, a fully used prior day, both daylight-saving boundaries, rejected unsigned owner claims, and separate owner usage. A browser fixture also checked retrying a place lookup after the reset in an open tab. Provider requests were simulated. Tool checkpoints were observed at approximately 1:55, 2:33, and 3:43 p.m. New York time. Time between checkpoints and builder hours are unmeasured.

### Friends, signup, and shortlist polish, November 25

The first signed-in visit prompts for a username before the one-time tour. Users can skip the prompt and return to Profile later. Friends can approve a request, follow back separately, or approve and send a follow-back request together. Guide access in each direction still requires approval from its owner. Shortlist entries show a concise, plan-specific reason under Why it fits. Source links remain under Place details. Share places copies selected venues, descriptions, Maps URLs, and booking links when available. Private notes and explanations stay in the guide. The copy preview is excluded from PostHog replay.

All 104 JavaScript and 63 Python tests passed. Local Chrome checks at 320, 390, and 1100 pixels used two fictional accounts, public venues, and simulated network and clipboard responses. They verified username setup before the tour, a reload without repeat onboarding, approval in both directions, visible reasons with sources in the details, and clipboard copy and fallback without guide-only content. This fixture work used no runtime provider spend. The observed implementation window was approximately 10:44–10:54 a.m. New York time, including tool waits. This is elapsed time and builder hours await reconciliation. [Signup](../docs/assets/build-4-username-setup.png) · [Friends requests](../docs/assets/build-4-reciprocal-follow.png) · [Shortlist](../docs/assets/build-4-inline-shortlist.png)

### Quota security follow-up, November 25

Applied the counter migration on Supabase after approval. Metadata checks confirmed both tables have row-level security and the signed function can update them. Anonymous and signed-in app roles lack both schema access and read permission for the decrypted Vault view. After a separate approval, the signing credential was created in Vault and saved in Render with the verified owner configuration. Deployment and live quota verification were pending at this checkpoint.

The local patch uses the client address supplied by Cloudflare on the public Render service and falls back to the connection peer when that address is unusable. It rejects unknown routes and unauthenticated private account requests before charging the allowance, and validates the HTTP request body and venue, plan, and import input before charging. The regression reproduced premature charging and now checks that rejected requests leave the counters untouched and a caller-supplied forwarding chain does not determine the visitor identity. The 104 JavaScript and 64 Python tests passed without provider calls. Live ingress and quota behavior remain unverified. The observed implementation window was approximately 5:04–5:08 p.m. New York time, including tool waits. This is elapsed time and builder hours await reconciliation.
