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
