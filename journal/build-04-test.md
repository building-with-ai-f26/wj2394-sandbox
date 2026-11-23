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
