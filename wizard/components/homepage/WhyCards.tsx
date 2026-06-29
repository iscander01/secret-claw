const CARDS = [
  {
    icon: "🔒",
    heading: "Your data, sealed",
    body:
      "When your agent connects to Gmail or your files, those credentials live in your private enclave — not in a third-party cloud.",
  },
  {
    icon: "🤖",
    heading: "A real AI agent",
    body:
      "Powered by OpenClaw or Hermes. Reads your email, takes actions, runs on your schedule. No middleman.",
  },
  {
    icon: "🔑",
    heading: "You hold the keys",
    body:
      "Your API keys are sealed inside your VM at rest. We never see them. Neither does anyone else.",
  },
];

export default function WhyCards() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-portal-muted">
            Why SecretForge
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-portal-text">
            Your agent. Your rules.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {CARDS.map((card) => (
            <div
              key={card.heading}
              className="rounded-xl border border-portal-border bg-portal-surface p-6"
            >
              <span className="inline-flex items-center justify-center rounded-full bg-portal-accentDim p-3 text-xl">
                {card.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-portal-text">
                {card.heading}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-portal-muted">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
