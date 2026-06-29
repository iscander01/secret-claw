# SecretForge — Homepage & Production Roadmap

*Brand confirmed: SecretForge (secretforge.io — domain already owned).
Replaces "Secret Claw" / "Carapace" throughout. Internal repo remains
`secret-claw` until a rename is convenient.*

---

## Why the homepage comes first

The homepage is the immediate blocker for Secret Labs. They need:

1. A real UI surface with a Google "Sign in" button to wire their auth against.
2. A post-auth redirect target (the deploy wizard, or a "getting started" state).
3. A named, branded product to integrate with — SecretForge.

Everything else (management UI, connectors, billing) is post-auth and can follow.

---

## Brand rationale

**SecretForge** works on multiple levels:

- **Secret** — privacy, confidential compute, your data sealed away. Also nods
  to Secret Network / SecretVM without being crypto-coded. A mainstream AI
  audience reads it as "private" first.
- **Forge** — active, creative energy. You're building something. Crafting your
  own agent. Not passive storage — an active tool you own.
- **Runtime agnostic** — unlike "claw"-based names, SecretForge works equally
  well for OpenClaw, Hermes, or any future runtime. The brand doesn't tie to
  one agent engine.
- **Tagline potential:** "Forge your agent." "Your agent, forged in private."
- **Domain:** secretforge.io — already owned. No cost, no risk.

---

## Tech stack — no change needed

The homepage lives inside the existing Next.js wizard app (`wizard/`). The root
`app/page.tsx` currently just redirects to `/create-agent` — the homepage replaces
that redirect. Same Tailwind config, same design tokens, same deployment.

No new framework, no separate repo.

---

## Design tokens (existing, use as-is)

```
Background:     portal-bg        #0B0F14
Surface:        portal-surface   #141A22
Surface2:       portal-surface2  #1A2230
Border:         portal-border    #222B38
Accent:         portal-accent    #FF4D2E   ← primary CTA colour
Text:           portal-text      #F5F7FA
Muted:          portal-muted     #8B98A9
Green:          portal-green     #22C55E
Amber:          portal-amber     #F5A623
Font:           Inter (sans)
```

Visual identity direction: dark, technical, confident. The "forge" metaphor
can be expressed through warm accent tones (the existing #FF4D2E is perfect —
ember/fire adjacent) without being heavy-handed. No literal anvil or flame
imagery needed — the name does the work.

---

## Homepage structure (`app/page.tsx`)

Single scrolling page, sections in order:

### 1. Nav / Header
- Logo: "SecretForge" wordmark
- Right side: "Sign in with Google" button → Secret Labs auth flow
- Minimal — no hamburger menu, no extra links for v1

### 2. Hero
- Headline: **"Forge your AI agent. Own it completely."**
- Subheadline: 2–3 sentences. Core pitch — your agent runs in a private
  enclave (SecretVM / confidential compute), your keys and data never leave
  it, not even we can read them.
- Primary CTA: **"Get started — Sign in with Google"**
- Secondary: **"How it works ↓"** (anchor scroll)
- Visual: pill/badge — "Powered by SecretVM confidential compute"

### 3. Why SecretForge (3-column cards)

| Card | Heading | Body |
|---|---|---|
| 🔒 | Your data, sealed | When your agent connects to Gmail or your files, those tokens live in your private enclave — not in a third-party cloud. |
| 🤖 | A real AI agent | Powered by OpenClaw or Hermes. Reads your email, takes actions, runs on your schedule. |
| 🔑 | You hold the keys | Your API keys and credentials are sealed inside your VM. We never see them. Neither does anyone else. |

### 4. How it works (3-step)

1. **Sign in with Google** — one click. SecretForge provisions your private
   API key via Secret Labs.
2. **Deploy your agent** — pick your runtime (OpenClaw or Hermes) and LLM
   preference. Your agent spins up in its own SecretVM in minutes.
3. **Connect your tools** — add Gmail and other connectors. Tokens stay sealed
   inside your enclave. You're the only one who can reach them.

### 5. Privacy tiers explainer (2-column table)

| | Confidential (default) | Convenience |
|---|---|---|
| **LLM** | SecretAI — runs inside your enclave | BYO API key — Anthropic/OpenAI, inference outside |
| **Connectors** | Tokens sealed in your VM | Via broker — instant setup, tokens live in broker's cloud |
| **Who sees your data** | Nobody (not even us) | The broker |

Framing: *"We offer both because we're honest about the trade-offs. Private
is the default. Convenience is clearly labelled."*

### 6. CTA / Footer
- Final CTA: **"Start forging"** → Google sign-in
- Footer: SecretForge · Powered by Secret Network · Privacy policy

---

## Post-auth flow

Secret Labs handles key provisioning. SecretForge's side:

1. User completes Google OAuth
2. Secret Labs callback returns — user now has a SecretAI API key tied to
   their Google account
3. Redirect to `/create-agent` — pre-populate SecretAI key field if API
   returns it
4. After deploy: redirect to `/agents/[id]`

New wiring needed:
- Storing the Google session (Track A storage decision gates this)
- Passing the provisioned key into the wizard form

---

## File changes for the homepage skeleton

```
wizard/app/page.tsx                      ← replace redirect() with homepage
wizard/app/layout.tsx                    ← update title/description to SecretForge
wizard/components/homepage/
  Nav.tsx                                ← logo + Sign in button
  Hero.tsx                               ← headline, subhead, CTAs
  WhyCards.tsx                           ← 3-column cards
  HowItWorks.tsx                         ← 3-step flow
  PrivacyTiers.tsx                       ← 2-column tier table
  Footer.tsx                             ← links, powered-by
wizard/components/ui/GoogleSignIn.tsx    ← stub button for Secret Labs to wire
```

The `GoogleSignIn` component is the key deliverable for Secret Labs — a clearly
stubbed button with props and a comment marking the integration point:

```tsx
// GoogleSignIn.tsx
// ── SECRET LABS INTEGRATION POINT ──────────────────────────────────────────
// Wire your OAuth flow here. Call onSuccess(apiKey) when auth completes.
// The apiKey is the SecretAI key provisioned for this user.
// ───────────────────────────────────────────────────────────────────────────
interface GoogleSignInProps {
  onSuccess: (apiKey: string) => void;
  onError?: (err: Error) => void;
}
```

---

## Full product surface map

### Public (pre-auth)
| Route | Page | Status |
|---|---|---|
| `/` | Homepage | 🔴 To build (this plan) |
| `/how-it-works` | Deep-dive privacy explainer | 🔴 Later |
| `/pricing` | Plans and tiers | 🔴 Later |

### Auth
| Route | Page | Status |
|---|---|---|
| `/auth/callback` | Post-Google-auth handler | 🔴 Secret Labs + SecretForge joint |
| `/auth/error` | Auth error state | 🔴 To build |

### App (post-auth)
| Route | Page | Status |
|---|---|---|
| `/create-agent` | Deploy wizard | ✅ Built & validated |
| `/agents` | Agent list / dashboard | 🔴 To build |
| `/agents/[id]` | Agent detail | 🟡 Partial (detail page exists) |
| `/agents/[id]/connectors` | Manage Gmail + tools | 🔴 To build |
| `/agents/[id]/settings` | Config, redeploy, teardown | 🔴 To build |
| `/account` | Profile, API key info | 🔴 To build |
| `/account/billing` | Plan, usage, payment history | 🔴 To build |

### Agent detail page sections (`/agents/[id]`)
- **Status** — running / stopped / error, uptime, VM URL
- **Chat** — talk to your agent directly in the UI
- **Connectors** — add/remove Gmail and tools, confidential vs convenience labelled
- **Logs** — real-time or recent activity feed
- **Settings** — runtime config, redeploy, teardown

---

## Track A — Foundation (run in parallel with homepage)

### 1. Durable storage
Swap `wizard/lib/db.ts` (in-memory / Vercel KV 24h TTL) for a real store.

**Recommendation: Supabase (Postgres)**
- Billing and account data will need a real DB eventually
- The `Db` interface in `lib/db.ts` is already the clean swap point

Tables needed immediately:
- `deployments` — agent records (replaces KV)
- `users` — Google account + provisioned SecretAI key
- `sessions` — auth session tokens

### 2. Docs refresh
- `README.md` — SecretForge name, all 4 combos validated, Google auth coming
- `ARCHITECTURE.md` — remove Keplr/walletAddress, update auth flow
- Remove all "Chunk 3 pending" / "BYO only" / Keplr references

### 3. Minimal CI
Add `.github/workflows/ci.yml`:
- `npm run build` check
- Existing render byte-equivalence test (OpenClaw BYO)
- Add Hermes + Secret tier render fixtures

---

## Open questions (resolve before/during build)

1. **Secret Labs API shape** — what does their auth callback return? A SecretAI
   key? A session token? A user ID? Determines what SecretForge stores and how
   to pre-populate the wizard.

2. **Storage** — Supabase vs Vercel KV. Recommendation: Supabase.

3. **Google OAuth app ownership** — who registers in Google Cloud Console?
   SecretForge, Secret Labs, or shared? Gates auth flow and CASA review.

4. **CASA verification** — Gmail confidential connector requires Google's app
   review (multi-week). Start as early as possible once the OAuth app exists.

5. **Demo mode** — `SECRET_CLAW_DEMO_MODE` defaults on in docker-compose.
   Needs to be off (or renamed `SECRET_FORGE_DEMO_MODE`) for production deploy.

---

## Immediate next steps (ordered)

| # | Action | Owner | Blocks |
|---|---|---|---|
| 1 | Share plan with Secret Labs — SecretForge name + auth API shape | You | Everything |
| 2 | Register Google OAuth app in Cloud Console | You / Secret Labs | Auth, CASA |
| 3 | Build homepage skeleton (Nav, Hero, WhyCards, HowItWorks, GoogleSignIn stub) | Dev | Secret Labs wiring |
| 4 | Update `layout.tsx` metadata to SecretForge | Dev | — |
| 5 | Track A: Supabase setup + db.ts swap | Dev | Auth session storage |
| 6 | Track A: docs refresh (README, ARCHITECTURE) | Dev | — |
| 7 | Track A: CI skeleton + Hermes/Secret fixtures | Dev | — |
| 8 | Secret Labs wires Google auth into `GoogleSignIn.tsx` stub | Secret Labs | Login flow |
| 9 | Build `/auth/callback` route | Dev + Secret Labs | Post-auth redirect |
| 10 | Pre-populate wizard with provisioned SecretAI key | Dev | Smooth onboarding |
| 11 | Start CASA review process | You | Gmail confidential tier |
| 12 | Begin Gmail confidential connector build (Track B) | Dev | Connector tier |
