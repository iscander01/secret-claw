interface DeployCard {
  name: string;
  tag: string;
  body: string;
}

const RUNTIMES: DeployCard[] = [
  {
    name: "OpenClaw",
    tag: "Autonomous claw",
    body:
      "A full agent runtime — reads your email, runs scheduled routines, takes actions on your behalf.",
  },
  {
    name: "Hermes",
    tag: "Lean agent runtime",
    body:
      "A lightweight Nous Hermes agent. Same private enclave, a smaller, faster footprint.",
  },
];

const MODELS: DeployCard[] = [
  {
    name: "SecretAI",
    tag: "In-enclave inference",
    body:
      "Attested open models running inside confidential compute. Your prompts never leave the VM.",
  },
  {
    name: "Bring your own key",
    tag: "Anthropic / OpenAI",
    body:
      "Use Claude or GPT with your own API key. Best-in-class models, sealed inside your agent's config.",
  },
];

function DeployGroup({ label, cards }: { label: string; cards: DeployCard[] }) {
  return (
    <div>
      <p className="mb-4 text-xs font-medium uppercase tracking-widest text-portal-muted">
        {label}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <div
            key={card.name}
            className="rounded-xl border border-portal-border bg-portal-surface p-5 transition-colors hover:border-portal-borderStrong"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold text-portal-text">
                {card.name}
              </h3>
              <span className="text-[11px] uppercase tracking-wider text-portal-accent">
                {card.tag}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-portal-muted">
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WhatYouDeploy() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-portal-text">
            What you can deploy
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-portal-muted">
            Pick a runtime and a model. Every combination ships into your own
            confidential SecretVM.
          </p>
        </div>

        <div className="flex flex-col gap-10">
          <DeployGroup label="Runtime" cards={RUNTIMES} />
          <DeployGroup label="Model" cards={MODELS} />
        </div>
      </div>
    </section>
  );
}
