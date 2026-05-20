# Secret Claw Wizard — Design Document

## Status

**v0.3 SKELETON (aligned with v0.8 product surface).** Full design
content gets filled in via design conversation with Garbonzo. This
document captures what each section/view needs to do, the UX questions
to resolve, and the cross-cutting decisions that affect the whole
product.

Decisions made during the design conversation get folded into the
relevant section's "Design decisions" subsection and copy goes into
"Copy". The skeleton's questions can be edited or struck through as
they're resolved; they're agenda items, not requirements.

Version history of this skeleton:

- **v0.1:** Six-screen multi-step wizard structure (pre-v0.7 pivot;
  uncommitted).
- **v0.2:** Restructured for v0.7 single-form + two-view + minimal
  list page surface.
- **v0.3:** Updated for v0.8. `/agents` list page dropped (header link
  becomes "Back to portal"); async portal handler pattern locked to
  Vercel's `waitUntil`; related session-tracking and direct-URL
  access questions removed.

---

## Architecture context

Two-view Next.js (App Router) application:

- `/create-agent` — single scrollable configuration form with five
  sections (Tier / SecretAI Key / Anthropic Key / Telegram / Submit).
  Progressive in-place validation; no inter-section navigation gates.
- `/agents/<deployment_id>` — agent detail page mirroring the SecretAI
  portal's VM detail page, with Overview + Logs tabs.

The wizard does not include an "agents list" view of its own (dropped
at v0.8). The header's "Back to portal" link points at
https://secretai.scrtlabs.com — the SecretAI portal's authoritative
VM list is the cross-session fleet view, since agents are real VMs in
the user's portal account.

Authentication to the SecretAI portal is via API-key bearer auth: the
user generates an API key in the portal, pastes it into the form's
SecretAI section, and the wizard uses it for all subsequent portal
calls. The wizard itself holds no persistent user accounts.

All SecretAI portal calls go through a same-origin Next.js API-route
proxy at `wizard/app/api/portal/*` because the portal does not serve
CORS headers — empirical Chunk 2 finding, see
`wizard/prototypes/api-validation/FINDINGS.md` §5. The proxy is a
single-hop forwarder: it receives the user's bearer token in the
request, attaches it to the upstream call, returns the response, and
forgets the token. No persistence of user credentials.

Deployment record lifecycle (locked at v0.6, refined at v0.8): a
single `POST /api/portal/submit-deployment` endpoint owns both the
record creation and the portal interaction. It generates the
`deployment_id`, inserts the deployment row with status="submitted"
synchronously, schedules the portal call via Vercel's `waitUntil`
(see "Async portal handler pattern" below), and returns the
`deployment_id` to the browser before the slow portal work begins.
The frontend gets the `deployment_id` in <100ms and navigates to
`/agents/<deployment_id>` immediately; the detail page polls the
local backend's deployment record (not the portal) and renders
Provisioning state until the `waitUntil` continuation finishes the
portal work and updates the record.

Canonical references:

- `docs/secret-claw-v1-demo-scope.md` (v0.8) — product scope, success
  criteria, non-goals
- `docs/secret-claw-v1-build-plan.md` (v0.8) — build sequence,
  estimates, component list, decisions
- `wizard/prototypes/api-validation/FINDINGS.md` — empirical API
  behavior
- `docs/secretvm-provisioning-research.md` — portal API research
  (some predictions superseded by FINDINGS.md, noted where relevant)

This document does NOT re-derive any of the above. It assumes the
reader has access to them.

---

## Visual style direction (Position A)

**Decision locked at v0.7: Position A — the wizard is visually
indistinguishable from the SecretAI Developer Portal at
https://secretai.scrtlabs.com.** Same color palette (dark mode,
orange-red accent), same type system, same component patterns
(selection cards, status pills, form sections, tab strips), same
information density. The wizard reads as a contiguous extension of
the portal, not as a separate product.

Honest scope on chrome: the wizard ships a minimal portal-style header
(SecretAI logo + page title + "Back to portal" link pointing at
https://secretai.scrtlabs.com) but explicitly does NOT recreate the
full portal sidebar, profile dropdown, balance indicator, or VM-fleet
list — those reflect concepts the wizard has no equivalent for.

**Open sub-questions:**

- Primary color (signal of action) — exact hex match to the portal's
  orange-red accent? Sample from the portal and pin it.
- Background colors — match the portal's dark-mode surface stack
  (page bg, card bg, input bg, hover states) exactly?
- Type system — what font family does the portal use? Do we pull the
  same webfont (licensing/loading story?) or rely on a CSS variable
  set that the portal also exposes?
- Animation level — what does the portal do on selection-card hover,
  button press, status-pill state transition? Mirror exactly.
- Iconography — what icon set does the portal use? Match the same set
  (lucide / heroicons / custom) and weight.
- Fidelity criteria — how do we judge "indistinguishable enough"?
  Side-by-side screenshots, a checklist of components, an external
  reviewer comparing pages? See Open Question 1 below.

---

## View 1: `/create-agent` (single configuration form)

The user lands on this page directly (the wizard's root entry point
redirects `/` here). They fill out the form section by section with
progressive in-place validation, and click "Create" at the bottom to
submit.

Layout: vertically stacked sections inside a centered container width
matching the portal's "Create New SecretVM" page width. Each section
is a `FormSection` component with title, helper text, inputs, and
inline validation feedback (`valid ✓` / error message). Sections are
not collapsed/expanded — they're always visible; users can scroll
freely between them.

### Section 1: Tier selection

**Purpose:** User sees the two-tier positioning (BYO / Secret) and
confirms BYO as their tier. (Pre-selected by default since Secret is
greyed.)

**Required state:** `selectedTier` defaults to `"byo"`; can't be
unselected; the Secret card is greyed and non-selectable.

**Inputs:**

- BYO selection card (selected by default; matches portal selection-card pattern)
- Secret selection card (greyed / "coming soon")

**Validation:** None — selection is the action and BYO is preselected.

**Error states:** None.

**Success criteria:** Section shows BYO as selected; no blocker for
the rest of the form.

**Key UX questions to resolve:**

1. Selected-state visual: what does the portal's selection-card look
   like when selected — border color shift, accent strip, checkmark,
   filled background? Mirror exactly.
2. Does the Secret card show "Coming soon" with a date, just greyed,
   or with a tooltip explaining why? What's the portal's pattern for
   "coming soon" cards (if any exist)?
3. Section header copy — does it just say "Tier" / "Plan" / "Choose
   your tier"? Match the portal's section-header tone.
4. Privacy/security context — does this section carry any "what's the
   difference between tiers" framing (TEE attestation, where keys
   live), or is that elsewhere on the page or implicit?
5. Mobile layout — do the two cards stack vertically? Match the
   portal's mobile behavior for selection cards.
6. Is there any "what is Secret Claw?" header copy above the tier
   section, or do we let the page title in the header carry the
   product framing?

**Design decisions (filled during conversation):** TBD via design conversation.

**Copy (filled during conversation):** TBD via design conversation.

---

### Section 2: SecretAI Portal API Key

**Purpose:** User pastes their SecretAI portal API key. The section
validates it against the portal in place and shows `valid ✓` (with
optional VM-count signal) on success.

**Required state going out:** `{ secretAiApiKey, existingVmCount }`
where `existingVmCount` is informational only.

**Inputs:**

- Paste-friendly text input for the API key
- Walkthrough content describing how to generate the key in the portal
- Inline validation icon (spinner / `valid ✓` / error)

**Validation:**

- `POST /api/portal/validate-key` proxies `GET /api/vm/instances` with
  `Authorization: Bearer <key>`. 200 → valid, returns VM count. 401 →
  invalid. Other status → network/portal error.

**Error states:**

- 401 (invalid/expired/revoked key)
- Network failure (proxy unreachable, portal unreachable, timeout)
- Empty/malformed input (we rely on the portal's verdict; no
  client-side format guess)

**Success criteria:** Validation returns 200; section shows `valid ✓`
plus optional VM count; the form's Create button becomes enabled
(provided other required sections are also valid).

**Key UX questions to resolve:**

1. The walkthrough of "go generate an API key" — embedded screenshots
   inline, side-panel steps, video link, or external link to portal
   docs? What's most useful given the user is paused mid-form?
2. Does the wizard open the portal in a new tab via button click, or
   just show a clickable link? Are we worried about the user losing
   their form state if they tab back and forth? (Single-form mitigates
   this — state is in-page, not screen-keyed — but worth confirming.)
3. After successful validation, how do we display "valid ✓ — N
   existing VMs" — is the VM count prominent or subtle? Does it serve
   as a "you're connecting the right account" signal or is it noise?
4. If validation succeeds but VM count is 0 (new user, no prior VMs),
   what does the success state say? Note: FINDINGS.md §9 flags that
   we haven't empirically tested whether the endpoint returns `200 []`
   or something else for zero-VM accounts. Worth treating as a Chunk 3
   verification step.
5. Error state for 401: what does the message say? Does it link back
   to the portal's API key page? Does it explain common causes (key
   expired, key revoked, wrong portal account)?
6. Error state for network failure / proxy unreachable: different UX
   than 401? Retry button vs auto-retry?
7. Validation timing: 113-183ms median via Node; through the proxy
   add ~50-100ms hop, so call it ~200-300ms perceived. Inline spinner,
   or instant feedback on blur with no spinner?
8. The portal exposes no identity to bearer callers (no wallet, no
   email, no sub — FINDINGS.md §3). Do we acknowledge this in the
   success state ("Your key is valid; we don't see your account
   identity") or stay silent?
9. If the user edits the key after it's already validated, does the
   section reset to unvalidated state immediately, or only on next
   validation attempt? (Portal-style real-time validation typically
   resets on first keystroke.)

**Design decisions (filled during conversation):** TBD via design conversation.

**Copy (filled during conversation):** TBD via design conversation.

---

### Section 3: Anthropic API Key

**Purpose:** User pastes their Anthropic API key. Section validates
with a lightweight test call in place.

**Required state going out:** `{ ..., anthropicApiKey }`.

**Inputs:**

- Paste-friendly text input for the Anthropic API key
- Inline help: "where do I get an Anthropic key?"
- Inline validation icon

**Validation:**

- `POST /api/validate-anthropic-key` (the wizard's own validation
  endpoint, per build plan Chunk 4). Backend makes a minimal Anthropic
  API call (e.g. messages endpoint with a 1-token completion request)
  and returns ok/invalid.

**Error states:**

- 401 from Anthropic (invalid key)
- Rate-limited / Anthropic transient failure
- Network failure
- Key valid for Anthropic but lacks Sonnet 4.6 access (open question
  — see UX question 5)

**Success criteria:** Validation returns ok; section shows `valid ✓`.

**Key UX questions to resolve:**

1. Anthropic key validation latency — Anthropic's API is typically
   100-500ms for the messages endpoint. Spinner needed, or fast enough
   for inline feedback?
2. Where in the section do we put the "where do I get an Anthropic
   key?" hint — inline below the input, in a side help panel, or as a
   modal that opens on click?
3. Do we mention cost expectations to the user (e.g., "typical usage
   ~$0.50-2/month")? Or stay silent? Scope doc's privacy framing
   suggests we should be transparent; product framing might prefer to
   not anchor on cost.
4. If validation succeeds, do we display anything about the key (the
   model it works with, the org it belongs to from `x-organization-id`,
   the rate-limit headers) or just `valid ✓`?
5. What if the key is valid for Anthropic but lacks Sonnet 4.6
   access (different access tiers exist)? Detect at validation time
   by requesting Sonnet 4.6 specifically, or just let provisioning
   succeed and have the agent fail at first inference? The first
   option gives the user a clear error here; the second is simpler to
   build.
6. Display text "Powered by Claude Sonnet 4.6 from Anthropic" —
   where in the section, what visual weight? Required for transparency
   per scope doc.

**Design decisions (filled during conversation):** TBD via design conversation.

**Copy (filled during conversation):** TBD via design conversation.

---

### Section 4: Telegram (optional)

**Purpose:** User optionally connects a Telegram bot. Encouraged but
skippable — scope doc default position.

**Required state going out:** Either `{ ..., telegramEnabled: true,
telegramBotToken, telegramChatId, telegramBotUsername }` or
`{ ..., telegramEnabled: false }`.

**Inputs:**

- Selection-card-style toggle: "Enable Telegram" vs "Skip — I'll add
  this later" (matching the portal's selection-card pattern for
  binary choices)
- When Enabled: bot token paste field, chat ID paste field, validation
  icons, BotFather walkthrough content
- When Skipped: brief explanation "Without Telegram, your agent will
  only be reachable through its web URL"

**Validation:**

- `POST /api/validate-telegram` (wizard backend). Calls Telegram's
  `getMe` with the bot token to confirm it's a real bot. Returns bot
  username on success. Does NOT verify the chat ID is reachable (see
  UX question 6).

**Error states:**

- 401 / 404 from Telegram (invalid bot token)
- Network failure
- Bot token valid but chat ID wrong (only surfaces at provisioning or
  first message — open question)
- Skip is not an error state but a valid completion path

**Success criteria:** Either validation succeeds and credentials are
captured, or user has explicitly skipped via the selection card.

**Key UX questions to resolve:**

1. Selection-card pattern: do "Enable" and "Skip" present as two
   side-by-side cards (mirroring the BYO/Secret tier-selection
   pattern), or as a single toggle? "Encouraged but skippable" — what
   visual hierarchy expresses that without nagging?
2. Does skipping change the detail page's content (no "your bot will
   message you" line in Ready state) or just omit the Telegram section
   silently?
3. The BotFather walkthrough: inline screenshots embedded directly in
   the section, side panel that slides out, separate help page that
   opens in new tab, or links out to a docs page? BotFather has ~5
   steps; the chat-ID step is the hardest.
4. Bot token and chat ID are two fields — sequential disclosure (chat
   ID only revealed after token validates) or parallel (both shown
   immediately)? Validation per field or combined?
5. How does the user find their chat ID? That's empirically the
   hardest step in the BotFather flow. Do we walkthrough that
   explicitly with screenshots, or assume the user can figure it out?
6. What if bot-token validation succeeds (`getMe` works) but the bot
   can't actually message the chat ID at provisioning time (wrong chat
   ID, bot not added to group)? Detect now via a test `sendMessage`,
   or let provisioning surface it? Test-send risks sending spam to the
   wrong chat; not-testing risks a silent failure after deployment.
7. The agent's welcome message fires once on first boot (~1 minute
   after the VM comes up) — does the wizard explain this here (so the
   user knows what to expect), or only on the agent detail page's
   Ready state?
8. The user can toggle Enable / Skip freely before clicking Create —
   confirm that's the expected behavior (versus making the choice
   "sticky" once made).
9. Bot username display after validation — useful as confirmation
   ("you connected @MyAgentBot") or noise?

**Design decisions (filled during conversation):** TBD via design conversation.

**Copy (filled during conversation):** TBD via design conversation.

---

### Section 5: Submit ("Create" button)

**Purpose:** User clicks "Create" to deploy. The wizard calls a single
backend endpoint (`POST /api/portal/submit-deployment`) which creates
the deployment record synchronously, schedules the portal interaction
via `waitUntil`, and returns the `deployment_id`. The browser
navigates immediately to `/agents/<deployment_id>`.

**Required state coming in:** All previous sections in valid state
(Tier selected, SecretAI key valid, Anthropic key valid, Telegram
either enabled+valid or skipped).

**Required state going out:** Browser navigates to
`/agents/<deployment_id>`. Form is no longer the active view.

**Inputs:**

- Primary CTA: "Create" (matches the portal's primary-action button
  style)
- (Optional) secondary disabled-state hint explaining what's missing
  if button is disabled

**Validation:** Button enablement is the validation surface — Create
is disabled until all required sections show `valid ✓`.

**Submit handler choreography (locked at v0.8 — `waitUntil`):** the
endpoint creates the deployment record synchronously and returns the
`deployment_id` in <100ms (no waiting for the slow portal call). The
`waitUntil` continuation runs the portal interaction (render compose,
multipart POST to portal `/api/vm/create`, poll
`/api/background-job/<jobId>`) after the response has been sent. See
build plan Chunk 3's "Async portal handler pattern" section for the
concrete shape.

**Error states:**

- Pre-submit: button is disabled because a required section isn't valid
- `POST /api/portal/submit-deployment` itself fails (network / backend
  down) — user remains on `/create-agent` with the form state intact
  and an error message
- (Portal submission failures inside the `waitUntil` continuation
  happen *after* navigation to `/agents/<deployment_id>`; they surface
  there as Failed state, not here)

**Success criteria:** `/api/portal/submit-deployment` returns a
`deployment_id`; browser navigates to `/agents/<deployment_id>`; the
user no longer sees the form.

**Key UX questions to resolve:**

1. Disabled button — does the button itself explain what's missing
   (tooltip on hover, sub-label "Complete X and Y to enable"), or do
   we rely on inline validation indicators inside each section to
   communicate "you still need to do X"?
2. Submit-then-navigate UX: the endpoint returns the `deployment_id`
   in <100ms, but DNS / SSL / Next.js route transition still adds
   perceptible latency. What's shown during that gap — a button
   spinner ("Creating..."), an overlay, an inline progress bar, or
   nothing (instant button state change followed by route transition)?
3. What if `POST /api/portal/submit-deployment` itself fails (backend
   down, database unreachable, network blip)? Where does the user end
   up — stays on the form with a banner error, gets a modal, or
   something else? Retry pattern?
4. Sticky button (always visible at bottom of viewport on scroll) or
   inline-only (only visible when the user scrolls to the bottom)?
   What does the portal do for its "Create New SecretVM" primary
   button?
5. Cancel / reset path — if a user wants to discard the form and start
   over, is there a "Reset" button anywhere, or do they just reload
   the page?
6. Visual weight — Create is the form's terminal action; how prominent
   is it relative to the rest of the page? Mirror the portal's
   primary-action styling.

**Design decisions (filled during conversation):** TBD via design conversation.

**Copy (filled during conversation):** TBD via design conversation.

---

## View 2: `/agents/<deployment_id>` (agent detail page)

The user lands here immediately after clicking Create. The page goes
through three states driven by the deployment record's status field:
Provisioning → Ready (success) or Provisioning → Failed (failure).
The page polls `GET /api/deployment-status/<deployment_id>` on a
short interval while status is `submitted` or `provisioning`, then
stops once status becomes terminal.

Layout: portal-style page header (logo + page title + "Back to portal"
link) above a centered content area mirroring the portal's VM detail
page. Title shows the agent name; subtitle area shows the StatusPill
(Provisioning / Running / Failed). Below the title is a TabStrip with
two tabs: Overview (default) and Logs.

### Overview tab

The meat of the detail page. Content varies by state.

**Provisioning state** (status: `submitted` or `provisioning`):

- StatusPill: "Provisioning" (yellow/orange)
- Visible info: agent name ("Secret Agent"), tier (BYO), Telegram
  enabled/skipped flag, creation timestamp, deployment ID
- Progress indicator with sub-status text reflecting the portal's
  background-job phases ("Submitting your configuration," "Creating
  your secure compute environment," "Installing your agent,"
  "Connecting to Telegram" if applicable)
- Page is polling `/api/deployment-status/<deployment_id>` ~every 3s

**Ready state** (status: `ready`):

- StatusPill: "Running" (green)
- Agent URL prominent (clickable / copyable)
- Gateway token (display strategy TBD — see UX question 4)
- Telegram bot username if applicable (copyable)
- Brief "what to do next" section:
  - "Open your agent's URL to chat directly"
  - If Telegram: "Your agent will message you on Telegram in about a
    minute. Tomorrow at 7am UTC you'll receive your first daily news
    briefing." (UTC offset placeholder — see UX question 8)
- A note about managing the VM directly in the SecretAI portal — the
  agent isn't locked inside our wizard
- Polling has stopped

**Failed state** (status: `failed`):

- StatusPill: "Failed" (red)
- `error_message` from the deployment record
- A "Try again" link back to `/create-agent`
- Polling has stopped

**Key UX questions to resolve:**

1. Polling cadence — 3 seconds matches the CLI's pattern. More
   frequent at the start (1s for the first 10s, then 3s) for snappier
   early feedback, or constant 3s throughout?
2. What status messages do we show during provisioning? Map the
   portal's background-job statuses to user-friendly text, or display
   generic milestones (submitting → building → installing → ready)?
   The portal's job-status payload shape is not documented in
   FINDINGS.md; verify when building the proxy.
3. Progress indicator format during Provisioning — indeterminate
   progress bar, percentage estimate (rough), or a step indicator
   ("Step 3 of 4: Installing your agent")? What does the portal's
   VM-creation detail page do during its own provisioning?
4. Is the gateway token (Ready state) displayed in plaintext or
   behind a "click to reveal" with copy-to-clipboard? The token is
   real auth — a casual shoulder-surf or screen-share could leak it.
   Reveal-on-click is safer; plaintext is simpler. What's the
   portal's pattern for sensitive VM credentials?
5. URL display: clickable (opens new tab), copy-to-clipboard only, or
   both side-by-side?
6. Deployment ID surfacing — visible in Provisioning state and Ready
   state? Where (page header subtitle, info block, footer)? What does
   the portal do with VM IDs on its detail page?
7. If provisioning takes longer than ~5 minutes (the typical SLA), at
   what point do we surface "this is taking longer than usual"? At 5
   min? 7 min? What does that look like — a banner update, a status
   change, a tooltip on the status pill?
8. Timezone: "Tomorrow at 7am UTC" copy — do we time-zone-adjust based
   on browser locale, or leave UTC and let user mentally convert?
   Scope doc uses 13:00 UTC for morning briefing; need to align copy
   with the cron job's actual time.
9. The welcome message fires within ~1 minute of provisioning
   completing. Do we mention that explicitly in the Ready state, or
   let the message arrive as a surprise?
10. Privacy/attestation messaging — does the Ready state reiterate
    the "your agent runs in attested compute" story, or is that
    implicit at this point?
11. "Test your agent" CTA on Ready state — a button that opens the
    URL with the gateway token pre-filled (deep link), or do we let
    the user navigate themselves so they learn the auth flow?
12. Failed state — "Try again" goes to `/create-agent`. Does it
    pre-fill any of the user's previous inputs (e.g., the SecretAI
    key — but that means storing it, which we don't), or is it a
    clean slate? Almost certainly clean slate, but worth confirming.
13. Browser refresh on the detail page during Provisioning — page
    re-fetches from `/api/deployment-status/<id>`, resumes polling
    from current status. Confirm this works cleanly.

**Design decisions (filled during conversation):** TBD via design conversation.

**Copy (filled during conversation):** TBD via design conversation.

---

### Logs tab

Recent gateway logs from the agent's OpenClaw container. Fetched on
tab activation (not live-streamed; not server-sent events). Simple
scrollable text view.

**Provisioning state:** Empty state ("Logs will appear after the
agent boots").

**Ready state:** Fetch from the gateway's log endpoint (TBD which
endpoint — see UX question 1) on tab activation. Display in a
monospace scroll view.

**Failed state:** Probably empty (the VM never came up), but if there
are any pre-boot logs (e.g. compose-rendering errors), surface them.

**Key UX questions to resolve:**

1. Source endpoint — which OpenClaw endpoint serves the logs? Is it
   authenticated by the same gateway token, or by a separate
   mechanism? Verify in Chunk 3 when wiring the integration.
2. Fetch timing — first tab activation only (cache thereafter), or
   refetch every time the tab gets clicked? Manual refresh button?
3. Format — raw text dump, structured rows (timestamp + level +
   message), or expandable JSON?
4. Retention — how many lines / how far back? Last 1000 lines? Last
   X minutes? What does the gateway endpoint return by default?
5. Empty/error state when the gateway is unreachable (VM up but
   gateway down, network blip) — distinguishable from "no logs yet"?
6. Mobile experience — long log lines wrap, scroll horizontally, or
   truncate?
7. Filter / search — out of scope for demo? Or worth a minimal
   text-filter input above the log view?

**Design decisions (filled during conversation):** TBD via design conversation.

**Copy (filled during conversation):** TBD via design conversation.

---

## Cross-cutting design decisions

### Component primitives (matching the SecretAI portal)

Chunk 3 builds these as a small component library before assembling
the views. Listed here so the design conversation can lock their
visual contracts before implementation.

**`PortalHeader`** — top-of-page strip with logo + product wordmark
(left), page title (center, optional), "Back to portal" link (right)
pointing at https://secretai.scrtlabs.com.

- Open: exact-match logo asset (svg / png / inline)?
- Open: page title visual treatment (matches portal's page title
  styling on detail pages)?
- Open: "Back to portal" link styling — text-only, icon + text,
  external-link icon?

**`SelectionCard`** — bordered card with title, description, optional
indicator, optional "coming soon" greyed variant. Used for tier
selection and Telegram enable/skip.

- Open: portal's selected vs unselected vs disabled visual states?
- Open: hover / active / focus styling?

**`StatusPill`** — small rounded pill with status color and label.

- Open: portal's exact colors for Running (green), Provisioning
  (yellow/orange), Failed (red)?
- Open: pill size / typography weight matches portal's?

**`FormSection`** — section wrapper used in `/create-agent`: title,
helper text, inputs, inline validation feedback.

- Open: section heading hierarchy (h2 / h3)?
- Open: divider between sections vs spacing-only separation?

**`TabStrip`** — Overview + Logs on `/agents/<id>`.

- Open: underline-on-active vs filled-pill vs background-shift active
  state?
- Open: behavior on mobile (horizontal scroll vs dropdown)?

**`LogsView`** — monospace scrollable text view.

- Open: line height, color treatment for log levels?

**`ValidationIcon`** — spinner / `valid ✓` / error icon for inline
validation feedback.

- Open: exact iconography (lucide checkmark? portal's?), exact colors?

### Mobile responsive behavior

**Question:** What's the minimum supported width? Standard breakpoint
at 640px? Does the single-form `/create-agent` page just become a
narrow scrolling column on mobile, or do sections collapse? Does
the BotFather walkthrough adapt at narrow widths? Mirror the portal's
mobile behavior.

### Error handling patterns

**Question:** Inline error messages near the field that failed?
Toast notifications for transient errors? How do we differentiate
transient (retry-this-call) vs permanent (fix-and-resubmit) failures
in the UI? Generic error boundary for unexpected failures (catches
React render errors and shows a fallback)?

### Loading state patterns

**Question:** Skeleton screens, spinners, or progress bars? Different
patterns for sub-second waits vs multi-second (key validation,
~200-300ms via proxy) vs multi-minute (provisioning, ~5 min)? What
does the portal use for each duration band?

### Validation feedback patterns

**Question:** Real-time as the user types (debounced), on blur, or on
explicit "validate" action? Visual indicators for "validating..." vs
"valid" vs "invalid"? Color choices for valid vs invalid (green/red
is conventional; accessibility considerations matter — colorblind-
friendly variants? Icon supplementation?).

### Navigation between views

**Question:** How does the user move between the two views?

- `/create-agent` submit → `/agents/<deployment_id>` (via `waitUntil`
  submit handler)
- `/agents/<deployment_id>` Failed-state "Try again" → `/create-agent`
- Header "Back to portal" link (any view) → https://secretai.scrtlabs.com
  (external)

Sub-questions:

- Browser back button from `/agents/<deployment_id>` to
  `/create-agent` after submit — form state is lost (no
  localStorage persistence of credentials). Confirm that's expected
  and we don't try to restore form state from history.
- Is there a "Cancel" or "Back to portal" inline action elsewhere on
  `/create-agent`, or only the header link?

### Portal proxy endpoints

**Question:** Route structure for the Next.js API proxy. Mostly
settled at v0.5-v0.8 in the build plan; details to confirm:

- Path convention: `/api/portal/validate-key`,
  `/api/portal/submit-deployment`, `/api/deployment-status/[id]`?
- How is the bearer token forwarded — `Authorization` header
  passthrough, or explicit body parameter that the proxy attaches to
  the upstream `Authorization` header?
- Single-hop forwarding only, never persisted — enforced in code
  (no logging of credential-carrying request bodies, no caching, no
  telemetry capture).
- Where do compose-rendering errors surface — as a Failed-state row
  in the deployment record (from inside the `waitUntil` handler),
  with the error message visible on the detail page?

### Async portal handler pattern (waitUntil)

**Settled at v0.8: Vercel's `waitUntil` API keeps the serverless
function alive after the response is sent.** The
`/api/portal/submit-deployment` endpoint creates the deployment record
synchronously and returns `{ deployment_id }` to the browser in
<100ms; the slow portal interaction (render compose, multipart POST,
poll background-job) runs inside the `waitUntil` continuation. See
build plan Chunk 3 for the concrete shape.

Fallback documented in build plan Chunk 4 (polling-driven progression
where `GET /api/deployment-status/<id>` kicks off the portal call on
first observed `submitted` row). Not built preemptively.

Open sub-question:

- How do we verify `waitUntil` survives long enough on Vercel's
  runtime for our ~5 minute portal polling? Vercel's docs are vague
  on the upper bound. Worth a small Chunk 3 smoke test: deploy a
  no-op endpoint that schedules a `waitUntil` with a 5+ minute
  timer + logging, observe whether it completes.

### Compose rendering

**Settled at v0.5 (backend-side) and v0.6 (Node port).** Wizard
backend implements rendering in Node/TypeScript; existing
`deploys/byo/scripts/render.py` stays as canonical local CLI tool.
Both held to byte-equivalent output via test fixtures under
`wizard/tests/renderer/`.

Open sub-question:

- Where does the rendered compose go before being submitted — held in
  memory only, written to a temp file, streamed directly to the
  portal's multipart endpoint?

### Form state management within `/create-agent`

**Question:** How is form state held — React Hook Form, controlled
components with local state, a Zustand store? What happens when the
user reloads `/create-agent`? Scope doc says state is lost on reload
(no persistence of sensitive credentials); the implementation choice
shouldn't fight that.

---

## Open questions for design conversation (whole-product)

These don't fit a specific section/view but affect the whole product:

1. **Position A fidelity criteria.** What's the bar for
   "indistinguishable from the portal"? A checklist of components,
   side-by-side screenshots, an external reviewer comparing the live
   wizard to the live portal, or an internal "looks like the portal
   to me" call? This bar drives Chunk 3's polish-pass scope.
2. **Portal API unreachable mid-flow.** Bail out with a clear
   message, retry with backoff, or queue the submission for later?
   Different answers for the validation calls (Section 2) vs the
   submission call (Section 5 → `waitUntil` continuation) vs the
   polling calls (View 2)?
3. **Telemetry policy.** Scope doc's non-goals say "no analytics."
   Does that include uncaught JavaScript errors / unhandled promise
   rejections (Sentry-style)? Strict no, or quiet yes for ops?
4. **Browser support.** Minimum supported browsers/versions? "Modern
   evergreen" (Chrome/Edge/Firefox/Safari last 2 versions), or more
   specific? Mobile browsers?
5. **First-time-user testing (zero VMs).** FINDINGS.md §9 calls out
   that we've only empirically tested the validation endpoint against
   an account with prior VMs. First-time users (zero VMs) need a
   Chunk 3 verification step early — if the endpoint behaves
   differently (e.g. 404 or a different body), the design needs to
   accommodate.
6. **The `/api/auth/me` curiosity.** FINDINGS.md §3 notes this
   endpoint returns 400 (not 404). If poking at it surfaces a future
   identity hook, we may want to revisit the no-identity stance on
   Section 2. Non-blocking for the design conversation; flagging for
   awareness.
7. **`waitUntil` reliability verification.** The v0.8 async handler
   pattern relies on Vercel's `waitUntil` surviving for the full
   provisioning window (~5 minutes). Worth an early Chunk 3 smoke
   test to confirm before building the full submit handler around it.
   See "Async portal handler pattern" cross-cutting section.

---

## Suggested order for the design conversation

This is a recommendation, not a constraint:

1. **Cross-cutting first** — visual style / Position A fidelity
   criteria, component primitives (PortalHeader, SelectionCard,
   StatusPill, FormSection, TabStrip, LogsView, ValidationIcon),
   validation patterns, error/loading patterns, navigation between
   views. These constrain every section and every view, and save
   repeating the same conversation seven times.
2. **Section 2 (SecretAI key)** — most consequential form section.
   The walkthrough copy, error handling, and "no identity to show"
   treatment shape the form's character. If this section is right,
   the rest are tractable.
3. **View 2 Overview tab** — the user spends most of their
   "experiencing-the-product" time here, both during the 5-minute
   provisioning wait and after on the Ready state. Polling cadence,
   status copy, token-display strategy, and next-steps content are
   the substance.
4. **View 2 Logs tab** — smaller decision surface but settles the
   Chunk 3 integration question of which gateway endpoint backs it.
5. **Section 4 (Telegram)** — Telegram has its own complexity
   (BotFather walkthrough, two fields, optional path, selection-card
   pattern for enable/skip). Resolve after the simpler sections.
6. **Section 5 (Submit)** — small but important: button enablement,
   submit-then-navigate UX, error path for submit-endpoint failure.
   The async-handler architecture is settled at v0.8 (waitUntil), so
   this conversation focuses on the user-visible UX rather than the
   handler's internal shape.
7. **Section 3 (Anthropic key)** and **Section 1 (Tier)** — simplest
   sections; can be decided quickly once the cross-cutting decisions
   and the harder sections have settled the patterns.

The whole-product Open Questions belong either at the start
(alongside cross-cutting) or at the end (sweep remaining); the
Position A fidelity-criteria question is the most important one to
land early because it affects every visual decision downstream. The
`waitUntil` reliability verification (Open Question 7) is a Chunk 3
smoke-test concern more than a design-conversation concern, but
flagged so it's not forgotten.

---

## What this skeleton informs

The filled-in version of this document becomes the input to Chunk 3
(wizard frontend build). Claude Code reading this document plus the
v0.8 scope doc plus the v0.8 build plan plus FINDINGS.md should have
enough specificity to implement the frontend without making product
decisions.
