# Build 3: Build.exe (The Core, in Small Changes)

Optional working notes. Publish your required build log on `docs/index.html`; no separate journal submission is required.

**Build due:** Monday, Nov 23, 2026 at 12:00 PM (Noon)

---

## 1. What you made
- November 17 work in progress on `codex/public-demo`. Added explicit HTTPS-hosted mode, Secure auth cookies, API origin checks, request caps, Render configuration, an isolated fictional sample guide and fixed-control feedback events. Deployment and public account checks await separate capped demo API keys.
- **PRs / Commits shipped:** 
- **Product Page URL / local demo evidence:** [Current fictional sample-guide phone view](../docs/assets/build-3-sample-guide.jpg). The public interactive URL awaits Render deployment.
- **Summary of what works now:** 44 JavaScript and 36 Python checks pass. Browser checks confirmed a Japanese catch-up sample result, feedback acknowledgement, return to an empty personal guide without copying sample records, and a 375px phone layout. Hosted sign-in, live Google enrichment and follower checks remain to run after deployment.

## 2. Metacognition ("Learn with AI"): Branches, Diffs & Agent Guardrails
- **Changes your AI tutor helped you understand: what changed, why it matters, and how you checked it:**
  1. 
  2. 
  3. 
- **New rule you added to `AGENTS.md` after catching your agent making a mistake this week:** 

## 3. What the agent did
- **Agent(s) & Model(s) used:** 
- **How you briefed/directed it (key prompts or `AGENTS.md` updates):** 
- **Where you had to step in, edit by hand, or reset context:** 

## 4. What didn't work
- A live sample occasion search returned no matches because the AI prompt required a cuisine even for occasion-only plans. Inspected the fictional model response, corrected the instruction and verified a supplied occasion match through a live provider call. Added a deterministic prompt regression check.
- A browser sample search returned a conversation-friendly option and a music bar with insufficient conversation evidence. A stricter prompt then rejected both fictional examples. Reverted that extra prompt change. Broader AI suitability evaluation remains open. Deterministic checks cover the underlying guide and privacy behavior.
- Browser testing on a new local port hit a sandbox network issue and then a stale browser error page. The server health check succeeded outside the sandbox. After the builder approved a fresh tab, the local sample and phone checks succeeded. Hosted checks remain to complete.
- **Bugs, agent loops, or broken assumptions:** 
- **How you diagnosed and fixed (or rolled back) them:** 

## 5. What it cost
- Observed session evidence on November 17, America/New_York. Initial audit 08:50:48–08:53:32. Approved implementation 08:54:03–09:35:51 at this checkpoint. Combined activity window 44m 32s, about 0.74 hours, awaiting builder reconciliation. Work continues beyond this checkpoint. These intervals estimate project activity, with no claim to measure attention or GitHub tab time.
- Builder created a separate demo key. OpenRouter displayed its $2 TOTAL cap with no reset during the browser check. Google demo project quotas still need setup. Free Render service selected in the draft form.
- Provider cost review on November 17 at about 09:34 NY. OpenRouter cumulative key usage $0.03324165, compared with $0.03152250 at the Build 2 review. Incremental runtime usage $0.00171915. Approved estimated pre-tax weekly Plus allocation $4.62. Known Build 3 subtotal $4.62171915, rounded $4.62. Known cumulative project subtotal about $13.89. Google charges are excluded from these subtotals until a provider billing record is available. This review covers activity since the November 16 snapshot through this checkpoint.
- Runtime reconciliation will use provider usage records. Hosted server counters and usage files are process-scoped and temporary on Render Free.
- **Agent / Token spend this week:** `$___`
- **Hosting / API runtime spend this week:** `$___`
- **Your hours spent this week:** `___ hrs`
- **Cumulative project spend to date:** `$___`

## 6. Pod Critique Sign-off
- **Tested by podmate(s):** 
- **Key feedback to address next:**

## Future product direction

The builder proposed OpenTable/Resy reservation links, followed by supported booking integrations, plus shared plans with booked restaurants and optional calendar availability. Calendar and plan sharing need explicit visibility choices for selected friends. These remain roadmap work beyond the public demo setup.

### Planning and shortlist design review, November 17

Prepared on `codex/planning-design` for builder review. The planning screen now shows the selected guide next to the chat composer and a direct route to Friends. Desktop places the conversation alongside the shortlist. Phones use a single column with compact headings after a reply. Results distinguish the AI reason, the saved note, visit status and endorsement, with existing Google photos and source details when available. Sample places remain explicitly fictional.

Confirmed a complete sample plan through the running local server and the real AI provider. Reviewed desktop and 400px phone layouts. Twelve existing checks passed for sample isolation, friend access, bulk selection and analytics privacy. Mobbin search was unavailable because the connected plan requires an upgrade. Used the builder’s supplied Beli screenshots and existing white/teal visual system. The design detector flagged small text and existing layout warnings. Increased new supporting text to at least 12px, and visually checked the scoped layout. Live venue photo presentation still needs a populated real-guide check.

Reservation follow-up remains staged. First show a verified venue-specific Resy or OpenTable link alongside Maps when one is available. Direct availability and in-app booking can follow supported provider access. Shared dinner plans and optional calendar sharing belong in a subsequent iteration. No reservation availability is represented in this design pass. Publish the redesign after the builder’s review.

### First sign-in tour and planning refinement, November 21

Added a skippable tour in Discover after the signed-in account guide loads. It covers choosing a guide, describing a plan, and reading the shortlist. The tour can open the fictional sample and can be replayed from Profile. Each browser remembers completion or dismissal separately for each account. Simplified the composer and put the saved note before the AI explanation.

The 44 JavaScript and 36 Python tests passed. A targeted simulated account check passed for first sign-in, sample entry, skip, completion, reload, replay, and separate account state. Browser access to the loopback preview timed out, so desktop and mobile visual checks and the live two-account rehearsal remain open. No live provider calls were made during this pass.

Clock checkpoints were 10:33:06 to 10:35:18 PM America/New_York. This is about two minutes of observed session coverage, including tool waits. Earlier unobserved time is excluded and weekly hours await reconciliation.

The follow-up preview session was observed from 10:37:47 PM to 10:47:14 PM America/New_York, including tool waits. The loopback preview briefly passed its health check, then stopped responding. Created a separate offline HTML preview with a fictional account and example recommendations. Verified that its embedded scripts parse and that the simulated session and sample shortlist return results.

### Discover critique and contextual tour, November 21

Two independent Impeccable reviews found competing entry points, an empty shortlist taking up space and a tour detached from the controls it described. The manual design review scored the earlier screen 18 of 40. The detector flagged the earlier results pane for padding. The revised empty state provides direct routes to add a Maps list or browse fictional places. The shortlist emphasizes place names and saved notes, with the AI explanation available on demand. The three tour steps follow the guide, prompt and shortlist in place, with progress, Back, Skip, Escape and Profile replay. The shared palette now uses aubergine and pale lavender with a green tour highlight.

Minglo's profile URL redirected to sign-in, so the signed-in reference could not be verified. Viewed the revised Discover screen in Chrome at desktop and phone widths using a fictional account. Browser interaction checks passed for tour entry, placement, navigation, sample browsing, completion, Profile replay and Escape. All 44 JavaScript tests and 36 Python tests passed. No provider requests were needed for the preview.

Clock checkpoints span 10:49:35 PM to 11:01:50 PM America/New_York, with tool waits included. This is estimated observed session coverage. Earlier unobserved time is excluded and weekly hours still await reconciliation.

The November 21 GitHub publication session was first observed at 11:02:41 PM America/New_York. All 80 tests passed again before staging. Clock coverage through 11:02:47 PM is an estimated partial session, including tool waits. Weekly hours await reconciliation.
