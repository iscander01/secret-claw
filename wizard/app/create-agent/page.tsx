"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { PortalHeader } from "@/components/PortalHeader";
import { SelectionCard } from "@/components/SelectionCard";
import { FormInput } from "@/components/FormInput";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusPill, type StatusKind } from "@/components/StatusPill";

type ValidationState = {
  kind: StatusKind;
  message?: string;
  detail?: string;
  vmCount?: number;
  botUsername?: string;
};

type TelegramChoice = "enabled" | "skipped" | null;
type Tier = "byo" | "secret";

interface SectionShellProps {
  id: string;
  index: number;
  title: string;
  helper?: string;
  status?: ValidationState;
  invalid?: boolean;
  children: React.ReactNode;
}

function SectionShell({ id, index, title, helper, status, invalid, children }: SectionShellProps) {
  const borderClass = invalid
    ? "border-portal-red ring-1 ring-portal-red/50"
    : "border-portal-border";
  return (
    <section
      id={id}
      className={`scroll-mt-20 rounded-xl border bg-portal-surface p-6 transition-colors ${borderClass}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-portal-surface2 text-xs font-semibold text-portal-muted">
            {index}
          </span>
          <h2 className="text-base font-semibold text-portal-text">{title}</h2>
        </div>
        {status ? <StatusPill kind={status.kind} label={status.message} /> : null}
      </div>
      {helper ? <p className="mb-4 text-xs leading-relaxed text-portal-muted">{helper}</p> : null}
      {children}
      {status?.detail ? <ErrorDetail detail={status.detail} /> : null}
    </section>
  );
}

function ErrorDetail({ detail }: { detail: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 text-xs text-portal-red">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="underline-offset-2 hover:underline"
      >
        Why?
      </button>
      {open ? (
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-portal-red/40 bg-portal-bg p-2 font-mono text-[11px] text-portal-muted">
          {detail}
        </pre>
      ) : null}
    </div>
  );
}

export default function CreateAgentPage() {
  const router = useRouter();

  const [tier, setTier] = useState<Tier>("byo");
  const [secretaiKey, setSecretaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [telegramChoice, setTelegramChoice] = useState<TelegramChoice>(null);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");

  const [secretaiState, setSecretaiState] = useState<ValidationState>({ kind: "idle" });
  const [anthropicState, setAnthropicState] = useState<ValidationState>({ kind: "idle" });
  const [telegramState, setTelegramState] = useState<ValidationState>({ kind: "idle" });
  const [botUsername, setBotUsername] = useState<string | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showInvalidHighlights, setShowInvalidHighlights] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  const secretaiValid = secretaiState.kind === "valid";
  // Anthropic key is only required for the BYO tier. Secret tier uses the
  // SecretAI key for inference (same key, two roles: vm/create auth + OpenClaw
  // provider apiKey).
  const anthropicValid = tier === "secret" ? true : anthropicState.kind === "valid";
  const telegramValid =
    telegramChoice === "skipped" || (telegramChoice === "enabled" && telegramState.kind === "valid");

  function firstInvalidId(): string | null {
    if (!secretaiValid) return "section-secretai";
    if (tier === "byo" && !anthropicValid) return "section-anthropic";
    if (!telegramValid) return "section-telegram";
    return null;
  }

  // Each validator returns the final ValidationState it settled on (in
  // addition to setting it on React state for the UI). The submit handler
  // uses these return values directly so it doesn't race with React's
  // async state-flush — a previous bug where the first Create click
  // silently exited because state was still `idle` / `validating` while
  // the per-field blur was firing in parallel.
  async function validateSecretai(): Promise<ValidationState> {
    const trimmed = secretaiKey.trim();
    if (!trimmed) {
      const s: ValidationState = { kind: "idle" };
      setSecretaiState(s);
      return s;
    }
    setSecretaiState({ kind: "validating" });
    let result: ValidationState;
    try {
      const res = await fetch("/api/portal/validate-secretai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const body = (await res.json()) as {
        valid: boolean;
        vmCount?: number;
        error?: string;
        status?: number;
      };
      if (body.valid) {
        result = {
          kind: "valid",
          message:
            typeof body.vmCount === "number" && body.vmCount > 0
              ? `Valid · ${body.vmCount} existing VM${body.vmCount === 1 ? "" : "s"}`
              : "Valid",
          vmCount: body.vmCount,
        };
      } else {
        result = {
          kind: "invalid",
          message: body.error || "Invalid key",
          detail: `portal validation returned status ${body.status ?? "unknown"}`,
        };
      }
    } catch (err) {
      result = {
        kind: "invalid",
        message: "Network error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
    setSecretaiState(result);
    return result;
  }

  async function validateAnthropic(): Promise<ValidationState> {
    const trimmed = anthropicKey.trim();
    if (!trimmed) {
      const s: ValidationState = { kind: "idle" };
      setAnthropicState(s);
      return s;
    }
    setAnthropicState({ kind: "validating" });
    let result: ValidationState;
    try {
      const res = await fetch("/api/validate-anthropic-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const body = (await res.json()) as {
        valid: boolean;
        error?: string;
        detail?: string;
        status?: number;
      };
      if (body.valid) {
        result = { kind: "valid", message: "Valid" };
      } else {
        result = {
          kind: "invalid",
          message: body.error || "Invalid key",
          detail: body.detail || `Anthropic returned status ${body.status ?? "unknown"}`,
        };
      }
    } catch (err) {
      result = {
        kind: "invalid",
        message: "Network error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
    setAnthropicState(result);
    return result;
  }

  async function validateTelegram(): Promise<ValidationState> {
    const tokenT = botToken.trim();
    const chatT = chatId.trim();
    if (!tokenT && !chatT) {
      const s: ValidationState = { kind: "idle" };
      setTelegramState(s);
      return s;
    }
    if (!tokenT || !chatT) {
      const s: ValidationState = {
        kind: "invalid",
        message: "Both fields required",
        detail: "Bot token and chat ID must both be provided to enable Telegram.",
      };
      setTelegramState(s);
      return s;
    }
    setTelegramState({ kind: "validating" });
    let result: ValidationState;
    try {
      const res = await fetch("/api/validate-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: tokenT, chatId: chatT }),
      });
      const body = (await res.json()) as {
        valid: boolean;
        error?: string;
        botUsername?: string;
        status?: number;
      };
      if (body.valid) {
        setBotUsername(body.botUsername);
        result = {
          kind: "valid",
          message: body.botUsername ? `Valid · @${body.botUsername}` : "Valid",
          botUsername: body.botUsername,
        };
      } else {
        result = {
          kind: "invalid",
          message: body.error || "Invalid",
          detail: `Telegram returned status ${body.status ?? "unknown"}`,
        };
      }
    } catch (err) {
      result = {
        kind: "invalid",
        message: "Network error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
    setTelegramState(result);
    return result;
  }

  async function onSubmit() {
    setSubmitError(null);
    setShowInvalidHighlights(true);
    setSubmitting(true);

    // Run-or-re-run all relevant validations and AWAIT their return values
    // before deciding whether to submit. Reading React state here would
    // race with the field-blur validation that fires when focus shifts to
    // the Create button — the first click would silently exit because
    // state was still `idle`/`validating`. Using direct return values
    // dodges the race entirely.
    const secretaiResult = await validateSecretai();
    const anthropicResult: ValidationState =
      tier === "byo" ? await validateAnthropic() : { kind: "valid" };

    let telegramResult: ValidationState;
    if (telegramChoice === "enabled") {
      telegramResult = await validateTelegram();
    } else if (telegramChoice === "skipped") {
      telegramResult = { kind: "valid" };
    } else {
      // null — user hasn't picked Enable or Skip yet
      telegramResult = {
        kind: "invalid",
        message: "Choose Enable or Skip",
        detail: "Pick one of the Telegram options before continuing.",
      };
      setTelegramState(telegramResult);
    }

    // Determine first invalid section (top-down, matching form order).
    let target: string | null = null;
    if (secretaiResult.kind !== "valid") target = "section-secretai";
    else if (tier === "byo" && anthropicResult.kind !== "valid")
      target = "section-anthropic";
    else if (telegramResult.kind !== "valid") target = "section-telegram";

    if (target) {
      setSubmitting(false);
      const el = document.getElementById(target);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    try {
      const res = await fetch("/api/portal/submit-deployment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          secretaiApiKey: secretaiKey.trim(),
          anthropicApiKey: tier === "byo" ? anthropicKey.trim() : undefined,
          telegramEnabled: telegramChoice === "enabled",
          telegramBotToken: telegramChoice === "enabled" ? botToken.trim() : undefined,
          telegramChatId: telegramChoice === "enabled" ? chatId.trim() : undefined,
          telegramBotUsername: telegramChoice === "enabled" ? botUsername : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        setSubmitError(`Submission failed (${res.status}). ${body.slice(0, 200)}`);
        setSubmitting(false);
        return;
      }
      const body = (await res.json()) as { deployment_id: string };
      router.push(`/agents/${body.deployment_id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <PortalHeader pageTitle="Create new agent" />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-portal-text">
            Create a new agent
          </h1>
          <p className="mt-1 text-sm text-portal-muted">
            Deploy your own private AI agent on SecretVM. Runs in attested confidential compute.
          </p>
        </div>

        <form
          ref={formRef}
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          <SectionShell id="section-tier" index={1} title="Tier">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectionCard
                title="BYO API"
                description="You bring an Anthropic API key. Powered by Claude Sonnet 4.6 from Anthropic."
                selected={tier === "byo"}
                onClick={() => setTier("byo")}
              />
              <SelectionCard
                title="Secret"
                description="Model hosted on SecretAI for end-to-end dual attestation. Powered by gemma4:31b on SecretAI rytn (tool-capable, parallel tool calls, 256K context)."
                selected={tier === "secret"}
                onClick={() => setTier("secret")}
              />
            </div>
          </SectionShell>

          <SectionShell
            id="section-secretai"
            index={2}
            title="SecretAI Portal API Key"
            helper="Go to the SecretAI portal, sign in with Keplr, generate an API key on your account, and paste it here. The key never leaves the wizard's server-side proxy — it's used to call the portal on your behalf and discarded after the request."
            status={secretaiState.kind === "idle" ? undefined : secretaiState}
            invalid={showInvalidHighlights && !secretaiValid}
          >
            <FormInput
              type="text"
              monospace
              placeholder="sk-..."
              value={secretaiKey}
              onChange={(e) => {
                setSecretaiKey(e.target.value);
                if (secretaiState.kind !== "idle") setSecretaiState({ kind: "idle" });
              }}
              onBlur={() => void validateSecretai()}
              invalid={secretaiState.kind === "invalid"}
            />
            <p className="mt-2 text-[11px] text-portal-muted">
              <a
                href="https://secretai.scrtlabs.com"
                target="_blank"
                rel="noreferrer"
                className="text-portal-accent hover:underline"
              >
                Generate a key in the SecretAI portal →
              </a>
            </p>
          </SectionShell>

          {tier === "byo" ? (
            <SectionShell
              id="section-anthropic"
              index={3}
              title="Anthropic API Key"
              helper="Your Anthropic key powers Claude Sonnet 4.6 inference. It's baked into the agent's config inside your attested VM — Anthropic sees the inference, the wizard never persists the key."
              status={anthropicState.kind === "idle" ? undefined : anthropicState}
              invalid={showInvalidHighlights && !anthropicValid}
            >
              <FormInput
                type="text"
                monospace
                placeholder="sk-ant-..."
                value={anthropicKey}
                onChange={(e) => {
                  setAnthropicKey(e.target.value);
                  if (anthropicState.kind !== "idle") setAnthropicState({ kind: "idle" });
                }}
                onBlur={() => void validateAnthropic()}
                invalid={anthropicState.kind === "invalid"}
              />
              <p className="mt-2 text-[11px] text-portal-muted">
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-portal-accent hover:underline"
                >
                  Get an Anthropic API key →
                </a>
              </p>
            </SectionShell>
          ) : (
            <SectionShell
              id="section-anthropic"
              index={3}
              title="Inference"
              helper="Secret tier runs inference on SecretAI's attested infrastructure — gemma4:31b on rytn. Uses the same SecretAI key from Section 2; no separate API key needed."
            >
              <div className="rounded-md border border-portal-border bg-portal-bg px-3 py-2 text-xs text-portal-muted">
                <span className="font-mono text-portal-text">secretai-rytn / gemma4:31b</span>
                <span className="ml-3 text-portal-mutedDim">· 256K context · attested compute</span>
              </div>
            </SectionShell>
          )}

          <SectionShell
            id="section-telegram"
            index={4}
            title="Telegram (optional)"
            helper="Connect Telegram to let your agent message you proactively — daily news brief, evening crypto summary, welcome message. Without Telegram, your agent is reachable only through its web URL."
            status={
              telegramChoice === "skipped"
                ? { kind: "valid", message: "Skipped" }
                : telegramState.kind === "idle"
                  ? undefined
                  : telegramState
            }
            invalid={showInvalidHighlights && !telegramValid}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectionCard
                title="Enable Telegram"
                description="Paste a bot token from @BotFather and your chat ID."
                selected={telegramChoice === "enabled"}
                onClick={() => {
                  setTelegramChoice("enabled");
                  if (telegramChoice !== "enabled") setTelegramState({ kind: "idle" });
                }}
              />
              <SelectionCard
                title="Skip — I'll add this later"
                description="Your agent will be reachable through its web URL only."
                selected={telegramChoice === "skipped"}
                onClick={() => {
                  setTelegramChoice("skipped");
                  setTelegramState({ kind: "valid", message: "Skipped" });
                }}
              />
            </div>

            {telegramChoice === "enabled" ? (
              <div className="mt-4 grid grid-cols-1 gap-5">
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-portal-muted">
                    Step 1 — Bot token
                  </span>
                  <p className="text-[11px] leading-relaxed text-portal-muted">
                    Message{" "}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noreferrer"
                      className="text-portal-accent hover:underline"
                    >
                      @BotFather
                    </a>{" "}
                    on Telegram, send{" "}
                    <code className="font-mono text-portal-text">/newbot</code>, follow the
                    prompts. BotFather replies with a token like{" "}
                    <code className="font-mono text-portal-text">1234567890:ABC-def…</code>.
                  </p>
                  <FormInput
                    type="text"
                    monospace
                    placeholder="0000000000:..."
                    value={botToken}
                    onChange={(e) => {
                      setBotToken(e.target.value);
                      if (telegramState.kind !== "idle") setTelegramState({ kind: "idle" });
                    }}
                    onBlur={() => void validateTelegram()}
                    invalid={telegramState.kind === "invalid"}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-portal-muted">
                    Step 2 — Chat ID
                  </span>
                  <p className="text-[11px] leading-relaxed text-portal-muted">
                    Open Telegram, find your new bot, send it any message
                    (e.g. <code className="font-mono text-portal-text">/start</code>), then open
                    this URL in a new tab and look for{" "}
                    <code className="font-mono text-portal-text">chat.id</code> in the JSON:
                  </p>
                  {botToken.trim().includes(":") ? (
                    <a
                      href={`https://api.telegram.org/bot${encodeURIComponent(botToken.trim())}/getUpdates`}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-all rounded-md border border-portal-border bg-portal-bg px-3 py-2 font-mono text-[11px] text-portal-accent transition-colors hover:border-portal-accent hover:underline"
                    >
                      https://api.telegram.org/bot{botToken.trim()}/getUpdates ↗
                    </a>
                  ) : (
                    <span className="block rounded-md border border-dashed border-portal-border bg-portal-bg px-3 py-2 font-mono text-[11px] text-portal-mutedDim">
                      Paste your bot token above to generate this link
                    </span>
                  )}
                  <FormInput
                    type="text"
                    monospace
                    placeholder="-1001234567890 or 1234567890"
                    value={chatId}
                    onChange={(e) => {
                      setChatId(e.target.value);
                      if (telegramState.kind !== "idle") setTelegramState({ kind: "idle" });
                    }}
                    onBlur={() => void validateTelegram()}
                    invalid={telegramState.kind === "invalid"}
                  />
                </div>
              </div>
            ) : null}
          </SectionShell>

          <SectionShell id="section-submit" index={5} title="Create your agent">
            <div className="flex flex-col gap-3">
              {submitError ? (
                <p className="text-xs text-portal-red">{submitError}</p>
              ) : null}
              <PrimaryButton
                type="submit"
                loading={submitting}
                onClick={() => void onSubmit()}
                className="self-start"
              >
                {submitting ? "Creating…" : "Create"}
              </PrimaryButton>
              {showInvalidHighlights && firstInvalidId() ? (
                <p className="text-xs text-portal-amber">
                  Some sections still need attention — we've scrolled to the first one.
                </p>
              ) : null}
            </div>
          </SectionShell>
        </form>
      </main>
    </div>
  );
}
