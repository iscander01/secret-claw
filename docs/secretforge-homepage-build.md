# SecretForge — Homepage Build Plan

*Engineering spec for the homepage skeleton. Target repo: `C:\dev\secret-claw`
(wizard lives at `wizard/`). Move to `C:\dev\secret-forge` is planned but not
yet done — all paths below are relative to the current repo.*

---

## Objective

Replace the root `app/page.tsx` redirect-to-wizard with a real homepage.
Deliverable: a working, styled homepage at `/` that matches the existing
portal design system, includes a stubbed Google sign-in button ready for
Secret Labs to wire, and routes authenticated users into the deploy wizard.

This is a skeleton build — copy can be rough, no animations required, no
real auth logic yet. The goal is a shippable surface Secret Labs can
integrate against.

---

## Design constraints

Use the existing design system throughout. No new dependencies.

**Colour tokens (tailwind.config.js):**
```
portal-bg        #0B0F14   — page background
portal-surface   #141A22   — card background
portal-surface2  #1A2230   — card hover / inner surfaces
portal-border    #222B38   — default borders
portal-borderStrong #2A3445 — hover borders
portal-accent    #FF4D2E   — primary CTA (ember/fire — perfect for forge theme)
portal-accentHover #FF6347 — CTA hover
portal-accentDim #3B1C13   — accent background tint
portal-text      #F5F7FA   — primary text
portal-muted     #8B98A9   — secondary text
portal-green     #22C55E   — success
portal-amber     #F5A623   — warning
```

**Typography:** Inter via existing globals.css. Font feature settings already applied.

**Existing reusable components** (import from `@/components/`):
- `PrimaryButton` — accent-coloured, handles loading state
- `SecondaryButton` — subtle pill button
- `SelectionCard` — bordered card with selected/disabled states
- `PortalHeader` — existing nav header (do NOT reuse for homepage — build a new Nav)
- `StatusPill` — for badges/pills

**Existing globals.css:** sets `min-width: 640px` — homepage should respect this
but also look good wider. Max content width: `max-w-6xl mx-auto px-6`.

---

## File structure

All new files go in `wizard/`. Do not touch files outside `wizard/`.

```
wizard/
  app/
    page.tsx                          MODIFY — replace redirect() with <HomePage />
    layout.tsx                        MODIFY — update metadata to SecretForge

  components/
    homepage/
      Nav.tsx                         NEW
      Hero.tsx                        NEW
      WhyCards.tsx                    NEW
      HowItWorks.tsx                  NEW
      PrivacyTiers.tsx                NEW
      HomepageFooter.tsx              NEW
    ui/
      GoogleSignInButton.tsx          NEW — stub for Secret Labs
```

---

## Component specs

### `layout.tsx` — metadata update only

```tsx
export const metadata: Metadata = {
  title: "SecretForge — Forge your AI agent",
  description:
    "Deploy your own private AI agent in a confidential enclave. Your keys, your data, your agent. Powered by SecretVM.",
};
```

No other changes to layout.tsx.

---

### `app/page.tsx` — homepage entry point

Remove the `redirect("/create-agent")` call entirely. Render the homepage:

```tsx
import Nav from "@/components/homepage/Nav";
import Hero from "@/components/homepage/Hero";
import WhyCards from "@/components/homepage/WhyCards";
import HowItWorks from "@/components/homepage/HowItWorks";
import PrivacyTiers from "@/components/homepage/PrivacyTiers";
import HomepageFooter from "@/components/homepage/HomepageFooter";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-portal-bg text-portal-text">
      <Nav />
      <main>
        <Hero />
        <WhyCards />
        <HowItWorks />
        <PrivacyTiers />
      </main>
      <HomepageFooter />
    </div>
  );
}
```

---

### `components/ui/GoogleSignInButton.tsx`

This is the primary Secret Labs integration point. Build it as a clean stub
with clear comments marking where auth wires in. It should visually match
the rest of the design system.

Props:
```tsx
interface GoogleSignInButtonProps {
  onSuccess?: (apiKey: string) => void;  // Secret Labs calls this post-auth
  onError?: (err: Error) => void;
  className?: string;
  size?: "sm" | "lg";                    // lg for hero, sm for nav
}
```

Visual: white/light button (Google brand convention) with Google "G" SVG icon
inline. Use the real Google "G" logo SVG (simple coloured paths, no external
dependency needed).

Behaviour for skeleton: clicking logs to console and shows a TODO alert.
Comment block at the top:

```tsx
// ── SECRET LABS INTEGRATION POINT ─────────────────────────────────────────
// Replace the onClick stub below with your Google OAuth flow.
// On successful auth + key provisioning, call:
//   props.onSuccess(secretAiApiKey)
// The key will be stored in session and pre-populated in the deploy wizard.
// On failure, call:
//   props.onError(new Error("reason"))
// ──────────────────────────────────────────────────────────────────────────
```

---

### `components/homepage/Nav.tsx`

Sticky top nav. Matches the portal's header height (`h-14`) and border style
but with SecretForge branding instead of "Secret AI Developer Portal".

Structure:
```
[Left]  Logo mark (⬡ or SF monogram in accent square) + "SecretForge" wordmark
[Right] GoogleSignInButton size="sm"
```

Logo mark: same pattern as existing PortalHeader — small square with accent
background (`bg-portal-accent`), white text. Use "SF" as the monogram for now.

Sticky: `sticky top-0 z-50 border-b border-portal-border bg-portal-bg/95 backdrop-blur`

---

### `components/homepage/Hero.tsx`

Full-width section, generous vertical padding (`py-24 md:py-32`).
Centred content, max-w-3xl.

Content:
```
[Badge pill]    "Powered by SecretVM confidential compute"
                — subtle, portal-surface2 bg, portal-muted text, small caps

[H1]            "Forge your AI agent.
                 Own it completely."
                — large, bold, portal-text
                — "Own it completely." on its own line, portal-accent colour

[Subheadline]   "SecretForge deploys your AI agent inside a private confidential
                 enclave. Your API keys, your conversations, your connected tools
                 — sealed inside your VM. Not even we can read them."
                — portal-muted, text-lg, max-w-2xl, leading-relaxed

[CTAs]          Primary: GoogleSignInButton size="lg" label="Get started — Sign in with Google"
                Secondary: plain anchor → "#how-it-works", text-portal-muted,
                           underline-offset style, "See how it works ↓"
```

Subtle background texture: a very faint radial gradient from
`portal-accentDim` (#3B1C13) at centre fading to transparent — gives a
warm ember glow behind the hero without being heavy. CSS:
`background: radial-gradient(ellipse 80% 50% at 50% 0%, #3B1C13 0%, transparent 70%)`

---

### `components/homepage/WhyCards.tsx`

3-column card grid. Section padding `py-20`. Centred heading above grid.

Section heading: "Why SecretForge" — small, portal-muted, uppercase tracking
Above a larger: "Your agent. Your rules." — portal-text

Cards (use the SelectionCard component style as reference but non-interactive):

| Icon | Heading | Body |
|---|---|---|
| 🔒 | Your data, sealed | When your agent connects to Gmail or your files, those credentials live in your private enclave — not in a third-party cloud. |
| 🤖 | A real AI agent | Powered by OpenClaw or Hermes. Reads your email, takes actions, runs on your schedule. No middleman. |
| 🔑 | You hold the keys | Your API keys are sealed inside your VM at rest. We never see them. Neither does anyone else. |

Card style: `rounded-xl border border-portal-border bg-portal-surface p-6`
Icon: large emoji or simple SVG in an accent-tinted circle
`rounded-full bg-portal-accentDim p-3 text-xl`

Grid: `grid grid-cols-1 gap-6 md:grid-cols-3`

---

### `components/homepage/HowItWorks.tsx`

Section id: `how-it-works` (anchor target from hero).
Section padding: `py-20`. Centred heading.

Heading: "How it works" — portal-text, large, bold.

3 steps in a horizontal row (stacked on mobile):

```
Step 1                    Step 2                    Step 3
──────                    ──────                    ──────
① Sign in with Google     ② Deploy your agent       ③ Connect your tools

One click. SecretForge    Pick OpenClaw or Hermes   Add Gmail and other
provisions your private   and your LLM. Your agent  connectors. Tokens stay
API key via Secret Labs.  spins up in a SecretVM    sealed in your enclave.
                          in minutes.               Only you can reach them.
```

Step number style: large numeral in accent colour, `text-4xl font-bold text-portal-accent`
Connector line between steps on desktop: simple `border-t border-portal-border`
positioned between step blocks.

---

### `components/homepage/PrivacyTiers.tsx`

Section padding: `py-20`. Centred heading.

Heading: "Honest about the trade-offs"
Subheading (portal-muted): "Every capability has a private option and a convenience
option. Private is the default. Convenience is clearly labelled — you always know
where your data goes."

Two-column comparison cards side by side (`grid grid-cols-1 gap-6 md:grid-cols-2`):

**Confidential (default)** card — accent border/ring:
```
border-portal-accent ring-1 ring-portal-accent/30
Badge: "Default" in portal-green

Rows:
  LLM          SecretAI — inference runs inside your enclave
  Connectors   Tokens sealed in your VM
  Your data    Readable only by you
```

**Convenience** card — standard border:
```
border-portal-border

Rows:
  LLM          BYO API key — Anthropic or OpenAI, inference outside
  Connectors   Via broker — instant setup, ~1000 apps
  Your data    Readable by the broker
```

Each row: small label (portal-muted) + value (portal-text), separated by
`border-b border-portal-border/50` dividers.

Bottom note (portal-muted, text-sm, centred):
"You choose per capability. Switch anytime."

---

### `components/homepage/HomepageFooter.tsx`

Simple, minimal. `border-t border-portal-border py-8`.

```
[Left]   © 2026 SecretForge · Powered by Secret Network
[Right]  Privacy policy (placeholder href="#") · Docs (placeholder href="#")
```

Text: portal-muted, text-sm. Links: hover:text-portal-text transition.

---

## Routing — what happens after sign-in

For the skeleton, `GoogleSignInButton.onSuccess` should:
1. Store the returned API key in `sessionStorage` (temp — will be replaced
   with proper session management in Track A)
2. `router.push("/create-agent")`

The wizard's SecretAI key field should check `sessionStorage` on mount and
pre-populate if a key is found. This is a one-liner addition to the existing
create-agent page — find the SecretAI key input and add a `useEffect` that
reads from sessionStorage.

---

## What NOT to build yet

- Real Google OAuth (Secret Labs' job)
- Pricing page
- `/how-it-works` deep-dive page
- Any auth session management beyond sessionStorage stub
- Animations or scroll effects
- Mobile hamburger menu
- Dark/light mode toggle

---

## Definition of done

- [ ] `/` renders the homepage (no redirect)
- [ ] Nav is sticky, shows SecretForge branding + Google sign-in button
- [ ] Hero renders with correct copy, badge, and both CTAs
- [ ] "See how it works" anchor scrolls to `#how-it-works`
- [ ] WhyCards renders 3 cards in a responsive grid
- [ ] HowItWorks renders 3 steps with correct IDs
- [ ] PrivacyTiers renders both columns, default card has accent ring
- [ ] Footer renders with correct links
- [ ] GoogleSignInButton is clearly stubbed with Secret Labs comment block
- [ ] `layout.tsx` metadata updated to SecretForge
- [ ] No TypeScript errors (`tsc --noEmit` passes)
- [ ] No broken imports
- [ ] Existing `/create-agent` and `/agents/*` routes still work
- [ ] `npm run build` passes clean
