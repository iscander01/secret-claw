"use client";

import { useRouter } from "next/navigation";

// sessionStorage key the deploy wizard reads on mount to pre-populate the
// SecretAI key field. Keep this string in sync with create-agent/page.tsx.
export const SECRETAI_KEY_STORAGE_KEY = "secretforge:secretai-key";

interface GoogleSignInButtonProps {
  onSuccess?: (apiKey: string) => void; // Secret Labs calls this post-auth
  onError?: (err: Error) => void;
  className?: string;
  size?: "sm" | "lg";
  label?: string;
}

function GoogleGlyph({ className }: { className?: string }) {
  // Official Google "G" mark — inline SVG, no external dependency.
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  onSuccess,
  onError,
  className,
  size = "lg",
  label = "Sign in with Google",
}: GoogleSignInButtonProps) {
  const router = useRouter();

  // Default post-auth behaviour: stash the provisioned SecretAI key in
  // sessionStorage (temporary — replaced by proper session management in
  // Track A) and route into the deploy wizard, which pre-populates from it.
  function handleSuccess(apiKey: string) {
    try {
      sessionStorage.setItem(SECRETAI_KEY_STORAGE_KEY, apiKey);
    } catch {
      // sessionStorage may be blocked (private windows); wizard still works,
      // the field just won't be pre-filled.
    }
    if (onSuccess) onSuccess(apiKey);
    router.push("/create-agent");
  }

  function handleClick() {
    // ── SECRET LABS INTEGRATION POINT ─────────────────────────────────────────
    // Replace the onClick stub below with your Google OAuth flow.
    // On successful auth + key provisioning, call:
    //   props.onSuccess(secretAiApiKey)
    // The key will be stored in session and pre-populated in the deploy wizard.
    // On failure, call:
    //   props.onError(new Error("reason"))
    // ──────────────────────────────────────────────────────────────────────────
    console.log("[GoogleSignInButton] TODO: wire Google OAuth flow here.");
    alert(
      "TODO: Google sign-in is not wired yet.\n\nThis is the Secret Labs integration point. " +
        "For now, continuing into the deploy wizard with a stub key so you can preview the flow.",
    );
    try {
      // Skeleton: proceed with a placeholder so the wizard flow is navigable.
      handleSuccess("");
    } catch (err) {
      if (onError) onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  const sizeClasses =
    size === "lg"
      ? "gap-3 px-5 py-3 text-sm"
      : "gap-2 px-3 py-1.5 text-xs";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center justify-center rounded-md border border-portal-border bg-white font-semibold text-[#1F1F1F] shadow-sm transition-colors hover:bg-[#F5F5F5] ${sizeClasses} ${className || ""}`}
    >
      <GoogleGlyph className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
      {label}
    </button>
  );
}

export default GoogleSignInButton;
