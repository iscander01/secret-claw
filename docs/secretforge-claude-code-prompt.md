# Claude Code Prompt — SecretForge Homepage Build

---

Read the full build spec before writing any code:
`C:\dev\secret-claw\docs\secretforge-homepage-build.md`

Then read these existing files to understand the design system and patterns:
- `wizard/tailwind.config.js` — colour tokens
- `wizard/app/globals.css` — base styles
- `wizard/app/layout.tsx` — current metadata (you will update this)
- `wizard/app/page.tsx` — current root page (you will replace the redirect)
- `wizard/components/PrimaryButton.tsx` — button pattern
- `wizard/components/SecondaryButton.tsx` — secondary button pattern
- `wizard/components/SelectionCard.tsx` — card pattern
- `wizard/components/PortalHeader.tsx` — existing header (for reference only, do not reuse)

---

## Your task

Build the SecretForge homepage skeleton inside the existing Next.js wizard app
at `C:\dev\secret-claw\wizard\`. All work is inside `wizard/` only — do not
touch anything outside it.

Work through these files in order:

### 1. `wizard/app/layout.tsx`
Update the metadata only:
- title: `"SecretForge — Forge your AI agent"`
- description: `"Deploy your own private AI agent in a confidential enclave. Your keys, your data, your agent. Powered by SecretVM."`

### 2. `wizard/components/ui/GoogleSignInButton.tsx` (NEW)
Create this first — it is imported by Nav and Hero.

Props interface:
```ts
interface GoogleSignInButtonProps {
  onSuccess?: (apiKey: string) => void;
  onError?: (err: Error) => void;
  className?: string;
  size?: "sm" | "lg";
}
```

Include the Secret Labs integration comment block exactly as specified in the
build spec. For the skeleton, onClick should console.log and call
`window.alert("Google sign-in coming soon — Secret Labs integration pending")`.

Visual: white background button, Google "G" SVG inline (use the real coloured
Google G — four coloured paths, no external dependency), text "Sign in with Google".
Size sm: `text-sm px-3 py-1.5`. Size lg: `text-base px-5 py-2.5`.
Style: `bg-white text-gray-700 font-medium rounded-lg border border-gray-200
hover:bg-gray-50 transition-colors inline-flex items-center gap-2.5 shadow-sm`

### 3. `wizard/components/homepage/Nav.tsx` (NEW)
Sticky nav. Height h-14. SecretForge branding left, GoogleSignInButton size="sm" right.
Logo: small square `bg-portal-accent` with white "SF" text + "SecretForge" wordmark.
Classes: `sticky top-0 z-50 border-b border-portal-border bg-portal-bg/95 backdrop-blur-sm`

### 4. `wizard/components/homepage/Hero.tsx` (NEW)
Use "use client" — GoogleSignInButton needs it.
Import useRouter from next/navigation. On sign-in success: sessionStorage.setItem
("secretai_api_key", apiKey) then router.push("/create-agent").

Content per spec:
- Faint radial gradient background (ember glow, portal-accentDim)
- Badge pill: "Powered by SecretVM confidential compute"
- H1: "Forge your AI agent." + "Own it completely." (second line in portal-accent)
- Subheadline as per spec
- GoogleSignInButton size="lg"
- "See how it works ↓" anchor to #how-it-works

### 5. `wizard/components/homepage/WhyCards.tsx` (NEW)
3-column responsive grid. Cards are non-interactive (div not button).
Per spec: 3 cards with icon circle, heading, body copy.
Section padding py-20, max-w-6xl mx-auto px-6.

### 6. `wizard/components/homepage/HowItWorks.tsx` (NEW)
id="how-it-works" on the section element (anchor target).
3 steps, horizontal on desktop, stacked on mobile.
Step numbers in portal-accent. Connector line between steps on desktop.
Per spec copy exactly.

### 7. `wizard/components/homepage/PrivacyTiers.tsx` (NEW)
2-column card comparison.
Confidential card: accent border + ring, "Default" green badge.
Convenience card: standard border.
Per spec rows and copy.
Bottom note: "You choose per capability. Switch anytime."

### 8. `wizard/components/homepage/HomepageFooter.tsx` (NEW)
Simple footer per spec. Border top, flex row space-between.

### 9. `wizard/app/page.tsx`
Replace the entire file. Remove the redirect import and call.
Import and render: Nav, Hero, WhyCards, HowItWorks, PrivacyTiers, HomepageFooter
wrapped in `<div className="min-h-screen bg-portal-bg text-portal-text">`.

### 10. `wizard/app/create-agent/page.tsx` — one small addition
Find the SecretAI API key input field. Add a useEffect that on mount reads
`sessionStorage.getItem("secretai_api_key")` and if present, pre-populates
that field's state value. This wires the post-auth flow from the homepage.

---

## Constraints

- TypeScript only — no JS files
- No new npm dependencies — use only what is already in package.json
- All colours via Tailwind portal-* tokens — no hardcoded hex except where
  noted (Google button is intentionally white/gray, not portal-themed)
- No `<form>` tags — use div + onClick per the project convention
- `"use client"` only on components that use hooks or browser APIs
  (Hero, and any component that imports it up the tree)
- Server components where possible (WhyCards, HowItWorks, PrivacyTiers,
  HomepageFooter, Nav can all be server components)

---

## Verify when done

Run these checks:
```bash
cd wizard
npx tsc --noEmit        # must pass with zero errors
npm run build           # must pass clean
```

Confirm:
- GET / renders the homepage (not a redirect)
- GET /create-agent still works
- GET /agents/* still works
- No console errors on homepage load
