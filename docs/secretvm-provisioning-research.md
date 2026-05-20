# SecretVM provisioning architecture — research notes

**Goal:** decide how a browser wizard (Keplr + secretjs) should invoke SecretVM
provisioning. The three options on the table were (1) on-chain Secret Network
transaction, (2) off-chain portal HTTP API with Keplr auth, (3) something else.

**TL;DR — Option 2 wins.** SecretVM provisioning is a portal HTTP API. The CLI
contains *zero* Cosmos/secretjs/CosmWasm code and *zero* EVM transaction code.
Keplr is used only to produce a signed message that the portal verifies and
exchanges for a session cookie. The compose file is uploaded as a multipart
form field. The KMS contract on Secret Network *is* touched, but only as an
encryption recipient (X25519 + AES-SIV ciphertext for secrets/docker creds) —
no transaction is broadcast by the client.

Source examined: `github.com/scrtlabs/secretvm-cli` @ HEAD (v0.9.0), cloned
2026-05-19. All file paths below are relative to that repo root.

---

## 1. Evidence — what the CLI actually does

### 1a. The provisioning endpoint is a multipart HTTP POST

`src/constants.ts:5-22` — every operation maps to an HTTP path under
`SERVER_BASE_URL`:

```ts
export const API_ENDPOINTS = {
    AUTH: {
        CSRF: "/api/auth/csrf",
        KEPLR_CALLBACK: "/api/auth/callback/keplr",
        SESSION: "/api/auth/session",
    },
    VM: {
        INSTANCES: "/api/vm/instances",
        TEMPLATES: "/api/templates",
        CREATE: "/api/vm/create",
        DETAILS: (vmId) => `/api/vm/${vmId}`,
        STOP / START / TERMINATE / LOGS / CPU_ATTESTATION / LAUNCH / ...
    },
    JOB: { STATUS: (jobId) => `/api/background-job/${jobId}` },
};
```

`src/services/apiClient.ts:11-12` —
```ts
export const SERVER_BASE_URL =
    process.env.SERVER_BASE_URL || "https://secretai.scrtlabs.com";
```

So the platform endpoint is `https://secretai.scrtlabs.com`. The CSRF + session
shape (`/api/auth/csrf`, `/api/auth/session`, `/api/auth/callback/<provider>`)
is the **NextAuth.js** convention — the portal is a Next.js app with a Keplr
credentials provider.

### 1b. VM create uploads compose as multipart/form-data

`src/commands/vm/create.ts:570-746` builds a `FormData` and POSTs it to
`/api/vm/create`. Key fields the server expects:

| form field            | source                                                     |
|-----------------------|------------------------------------------------------------|
| `name`, `vmTypeId`    | required, plain strings                                    |
| `environment`         | `"dev"` or `"prod"`                                        |
| `dockercompose`       | **the compose file itself, as a file part** (line 742-746) |
| `dockerfiles`         | optional `.tar` of additional files (line 771-775)         |
| `fs_persistence`, `platform`, `private`, `upgradeability` | flags         |
| `kms_provider`        | `secret-network`/`google`/`dstack`/`gramine` (line 780-789)|
| `secrets_cipher`      | X25519+AES-SIV ciphertext if using contract KMS (line 604) |
| `secrets_plaintext`   | sent plain if using non-contract KMS (line 619)            |
| `kms_docker_*`        | encrypted private-registry creds (line 637-643)            |
| `eip8004_registration`| JSON blob (the portal does the on-chain reg, not the CLI)  |
| `enable_ita_jwt`, `enable_poc_jwt` | attestation flags                             |

The actual POST, `src/commands/vm/create.ts:857-867`:
```ts
return await apiClient.post<CreateVmApiResponse>(
    API_ENDPOINTS.VM.CREATE,
    formData,
    {
        headers: { ...formData.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    },
);
```

Nothing else. No Tendermint, no MsgExecuteContract, no `broadcastTx`. I grepped
the whole `src/` tree:

```
grep -rn "secretjs|SigningCosmWasmClient|broadcastTx|MsgExecuteContract|@cosmjs" src/
→ (no matches)

grep -rn "ethers|viem|wagmi|eth_sendTransaction" src/
→ (no matches — only the literal string "eip8004_registration" as a form field name)
```

The CLI's only dependencies of note are `axios`, `tough-cookie`,
`axios-cookiejar-support`, `node-forge`, `tweetnacl`, `miscreant`, `crypto-js`,
`commander`, `inquirer`. No blockchain client of any kind.

### 1c. Keplr's role is auth-only, and the CLI delegates to the portal UI

There are **two** Keplr code paths in the CLI:

**Path A — `src/services/authService.ts:32-79`** — a `loginWithKeplr` helper
that posts `{walletAddress, signature, message, csrfToken, json:"true"}` to
`/api/auth/callback/keplr` as `application/x-www-form-urlencoded`. This is the
NextAuth Keplr credentials handler. **It is not wired to any user-facing CLI
command in this codebase** — it appears to be a leftover or a programmatic
hook. The shape of the body is what matters for the wizard, because it tells
us exactly what the portal accepts.

**Path B — `src/commands/auth/login.ts`** (the actual `secretvm-cli auth login`
command) — spins up a localhost HTTP server, opens
`${SERVER_BASE_URL}/sign-in?cliCallbackPort=<port>` in the user's browser,
and waits for the portal's web UI to redirect back with a
`?sessionToken=...&tokenName=...` query string. The CLI reconstructs the
cookie from those params and saves it to `~/.secretvm-cli/session.json`. The
Keplr signing itself happens in the portal SPA, **not in the CLI**.

```ts
// src/commands/auth/login.ts:97-110
const loginUrlParams = new URLSearchParams({ cliCallbackPort: String(port) });
const loginUrl = `${SERVER_BASE_URL}/sign-in?${loginUrlParams.toString()}`;
await open(loginUrl);
// ...
// src/commands/auth/login.ts:46-71  — the local server expects:
//   GET /callback?sessionToken=<value>&tokenName=<cookie name>
```

After login, all subsequent requests reuse the session cookie via the
tough-cookie jar (`src/services/apiClient.ts:90-99`). There is also an
alternate `Authorization: Bearer <apiKey>` path
(`src/services/apiClient.ts:85-87`) for service-to-service use — that branch
also sets `x-swagger: true`, which strongly implies the portal's Swagger/OpenAPI
UI uses the same backend.

### 1d. The KMS contract: client-side encryption, no transaction

`src/services/kmsEncryption.ts` (whole file, ~70 lines) is the only file that
touches a Secret Network contract. It does X25519-ECDH + AES-128-SIV with the
contract's public key — i.e. it produces a ciphertext that *only the KMS
contract running inside SGX can decrypt*. The CLI never broadcasts a tx; it
just hex-encodes the ciphertext and attaches it to the multipart form as
`secrets_cipher` (or `kms_docker_cipher` for private-registry passwords).

`src/constants.ts:1-3` — the contract's pubkey is hardcoded:
```ts
export const KMS_CONTRACT_PUBLIC_KEY =
    process.env.KMS_CONTRACT_PUBLIC_KEY ??
    "4351c6cb98337d7b834ebb00667993b473151f14038e2ae125070eb4fb58d271";
```

Presumably the portal backend (or the VM at boot) is the one calling
`decrypt_with_contract_key` on-chain. The browser/CLI never sees it.

### 1e. EIP-8004 is also a server-side concern

`--eip8004-chain` only accepts `base-mainnet`
(`src/commands/vm/create.ts:154-161` and `:533-543`). The CLI reads the
registration JSON, augments it with `teequote` + `workload` service URLs, and
ships it as a single `eip8004_registration` form field
(`src/commands/vm/create.ts:846-851`). The actual Base-mainnet transaction is
clearly made by the portal backend — the CLI has no EVM signer, no RPC URL,
no chain-id constant.

### 1f. Docs confirm the same picture

The `?ask=` query on the docs page (which proxies a model over the docs corpus)
returned: "VM creation uses HTTP-based provisioning, not a Secret Network
blockchain transaction... `POST /api/vm/create` accepting
`multipart/form-data`... the file transfers as a multipart form field named
`dockercompose`... On-chain activity occurs separately during upgradeability —
adding service images publishes an `add_image_to_service` event on-chain, but
initial provisioning remains HTTP-based." Two independent sources agree.

---

## 2. Wizard provisioning flow (browser context)

Reusing the established `getOfflineSignerAuto` + secretjs Keplr pattern, the
wizard would:

1. **Authenticate to the portal**. Two options, in order of likelihood of
   working out-of-the-box:

   **2a. Replicate the CLI's NextAuth flow programmatically** — `GET
   https://secretai.scrtlabs.com/api/auth/csrf` to get a CSRF token, then ask
   Keplr to `signArbitrary` a portal-provided nonce message, then `POST` to
   `/api/auth/callback/keplr` with `walletAddress + signature + message +
   csrfToken + json=true` (the exact field set from `authService.ts:39-51`).
   The response carries the NextAuth session cookie. This is what
   `loginWithKeplr` is *coded to do* — the only catch is whether CORS allows
   it from arbitrary origins (see §3).

   **2b. Redirect-flow fallback** — open
   `https://secretai.scrtlabs.com/sign-in?<wizardCallbackUrl>` in a popup or
   redirect, let the portal SPA do the Keplr handshake, receive
   `sessionToken` + `tokenName` back via redirect/postMessage. This is the
   path the CLI uses. More moving parts (popup blockers, redirect URL
   allowlisting on the portal side) but bypasses CORS.

2. **Fetch templates** (optional UX nicety): `GET /api/templates` returns the
   list including each template's full `docker` string.

3. **Build the form** in the browser using the native `FormData` API,
   mirroring `src/commands/vm/create.ts:570-746`:
   - text fields: `name`, `vmTypeId`, `environment`, `platform`, `kms_provider`,
     and any of the booleans the wizard exposes
   - file field: `formData.append("dockercompose", new Blob([yamlString]),
     "docker-compose.yml")`
   - secrets: re-implement `kmsEncryption.ts` in the browser. All three
     primitives are already browser-friendly — `tweetnacl` works as-is,
     `miscreant` ships an ES module, `node-forge` is browser-safe. The
     `encryptForKmsContract` function is ~30 lines and can be copied verbatim.

4. **POST `/api/vm/create`** with `credentials: "include"` so the session
   cookie is sent. The response is a `CreateVmApiResponse` (= `VmInstance`
   shape, see `src/types.d.ts:39-62`) containing `vmId`, `status`,
   `ip_address`, `vmDomain`.

5. **Poll** `/api/background-job/<jobId>` and/or `/api/vm/<vmId>` for status
   transitions. The CLI's `edit.ts` shows the exact polling pattern (3s
   interval, 10min timeout, statuses `completed` / `failed`).

The wizard never broadcasts a Secret Network tx. Keplr is used only to sign an
arbitrary message ("login as <walletAddress>") for portal auth — the same
signing API existing Secret dApps already use.

---

## 3. Browser-vs-CLI complications

1. **CORS is the single biggest unknown.** The CLI's axios runs in Node, so it
   ignores CORS. A browser at e.g. `https://wizard.example.com` calling
   `https://secretai.scrtlabs.com/api/...` requires the portal to send
   `Access-Control-Allow-Origin` for our wizard's origin **and**
   `Access-Control-Allow-Credentials: true` (because we need the session
   cookie). If the portal currently only allows its own origin, we'll get a
   browser-blocked request and we have two ways out: (a) ask Secret Labs to
   add our origin to the allowlist, (b) use the redirect-popup flow (§2.1b)
   instead of programmatic auth — popups carry cookies cross-origin without
   CORS preflight, the wizard just needs to learn the session token via
   `window.postMessage`. The CLI sidesteps both by running locally.

2. **NextAuth session cookies are typically `SameSite=Lax` and `HttpOnly`**.
   That means the browser will *send* them on top-level navigation (popup
   redirect flow is fine) and on same-site fetches, but JavaScript can't read
   them. The wizard cannot manually attach the cookie — it has to rely on
   `fetch(..., {credentials: "include"})` and trust the browser. If the
   cookie's `SameSite=Strict`, cross-origin fetches won't send it at all
   regardless of CORS, and the only path is to host the wizard on a
   `*.scrtlabs.com` subdomain. **Worth checking on the live portal** via
   devtools.

3. **Multipart file upload** is trivial with the browser's native `FormData` +
   `Blob`. No special handling needed; the browser sets the multipart
   boundary automatically. Just don't manually set `Content-Type` —
   `fetch()` will do it correctly only if we leave it alone.

4. **Re-implementing `encryptForKmsContract` in the browser** is mechanical.
   `tweetnacl` and `miscreant` both have published browser builds. The
   alternative is to use `kms_provider = google` or `dstack` to skip
   encryption entirely (`secrets_plaintext` over HTTPS — the portal handles
   key wrapping server-side). For a "good enough" v0 the wizard can probably
   default to non-contract KMS and add the encryption code later.

5. **No transaction-signing edge cases**. Because we never broadcast a Cosmos
   tx for provisioning, we don't have to worry about Keplr quirks like
   `signAmino` vs `signDirect`, gas estimation, or whether Keplr supports
   custom message types. The `signArbitrary` path for auth is universally
   supported.

6. **Background-job polling needs the same auth context** — i.e. the session
   cookie has to keep being sent on each poll. Same CORS/SameSite concerns
   apply.

7. **Compose-file Traefik munging** (`create.ts:665-740`) is currently done
   client-side: if the user picks `--tls`, the CLI mutates the compose YAML
   to add a Traefik service + per-service labels before uploading. The
   wizard would need a YAML parser in the browser (`js-yaml` is fine) and
   the same mutation logic. Alternatively, just don't expose that toggle in
   v0 and let users provide an already-Traefik'd compose.

---

## 4. Open questions / things I couldn't resolve

1. **Does the portal accept cross-origin requests from arbitrary wizards?**
   The CLI hits the API from Node, so it sees no CORS. I'd need to either
   send a `curl -I -X OPTIONS` (out of scope for this read-only task) or
   ask the SecretAI portal team directly. **Resolution path: ask Secret
   Labs**, or just hit `OPTIONS https://secretai.scrtlabs.com/api/vm/create`
   from the wizard origin and inspect the response.

2. **Exactly what message does the portal want Keplr to sign?** The
   `loginWithKeplr` helper takes a `message` parameter but doesn't construct
   it. The portal presumably returns a nonce/challenge in some prior
   request, or expects a fixed message format like
   `"Sign in to SecretAI with wallet ${address} at ${timestamp}"`. The CLI
   never exercises this branch end-to-end, so we can't tell from the source.
   **Resolution path: open the portal's `/sign-in` page in devtools and
   watch the network tab during a real Keplr login.**

3. **Is `loginWithKeplr` actually a supported public path, or dead code?**
   It's exported but unreferenced by any command file in the CLI. It could
   be (a) intended for `secretvm-cli auth login --wallet-address X
   --signature Y`, which would mean the CLI is partway through migration
   from redirect-flow to programmatic auth, or (b) abandoned scaffolding.
   The portal backend almost certainly accepts the endpoint either way
   (it's standard NextAuth), but the "is this the blessed path" question
   matters for whether we expect long-term support. **Resolution path: ask
   the portal team, or just try it.**

4. **Where does `eip8004_registration` get submitted on-chain?** Almost
   certainly the portal backend has a Base RPC client and submits the tx
   after VM boot, but this is invisible from the CLI. Not blocking for the
   wizard (we just forward the JSON like the CLI does), just noting it.

5. **What KMS-contract address does the portal use, and is the pubkey in
   `constants.ts` the production one?** The constant is hardcoded but
   overridable via `KMS_CONTRACT_PUBLIC_KEY` env var. If the production
   portal expects a different key, our encrypted secrets will decrypt to
   garbage. **Resolution path: confirm the live value with Secret Labs
   before the wizard ever encrypts a real secret.**

---

## 5. What this means for the wizard build

- **Architecture:** browser SPA, no smart-contract calls. Keplr does
  `signArbitrary` for auth only. Provisioning is a single multipart POST.
- **Effort estimate is dominated by CORS/auth plumbing, not provisioning
  logic.** The provisioning request itself is ~30 lines of `fetch` +
  `FormData`. The auth handshake is the part where we're guessing at
  portal-side behavior.
- **Fastest path to a working POC:** use the popup-redirect login flow
  (§2.1b) to sidestep CORS for the auth step, then make the create call
  same-origin if we can host on `*.scrtlabs.com`, or with
  `credentials:"include"` and pray for permissive CORS otherwise. If that
  fails, the unblocking ask to Secret Labs is small and specific: "please
  CORS-allow `https://<our-wizard-origin>` on `/api/vm/*` and
  `/api/auth/*` with credentials."
- **Don't bother building a Cosmos transaction path.** It doesn't exist on
  the platform side. Even if we wanted to, there's no contract to call.
