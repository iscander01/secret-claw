export type DeploymentStatus = "submitted" | "provisioning" | "ready" | "failed";

export type Tier = "byo" | "secret";

export interface DeploymentRecord {
  deployment_id: string;
  status: DeploymentStatus;
  tier: Tier;
  vm_id?: string;
  vm_hostname?: string;
  gateway_token?: string;
  telegram_enabled: boolean;
  telegram_bot_username?: string;
  error_message?: string;
  created_at: string;
  provisioned_at?: string;
}

export interface RenderConfig {
  tier?: Tier;
  vmHostname?: string;
  // BYO tier requires anthropicApiKey. Secret tier requires secretaiApiKey
  // (used for both the OpenClaw provider config AND the portal vm/create
  // bearer auth — same key serves both roles).
  anthropicApiKey?: string;
  secretaiApiKey?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  deploymentId?: string;
  gatewayToken?: string;
  welcomeAtIso?: string;
}

export interface RenderResult {
  compose: string;
  openclawJson: string;
  cronJobsJson: string;
  workspace: Record<string, string>;
  deploymentId: string;
  gatewayToken: string;
  telegramEnabled: boolean;
  tier: Tier;
}

export interface FormSubmission {
  tier: Tier;
  secretaiApiKey: string;
  // Anthropic key is only required for BYO tier. Optional in the
  // FormSubmission type — the submit handler validates the tier-specific
  // requirements server-side.
  anthropicApiKey?: string;
  telegramEnabled: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramBotUsername?: string;
}
