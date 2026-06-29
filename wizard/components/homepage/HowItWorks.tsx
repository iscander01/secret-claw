const STEPS = [
  {
    num: "1",
    title: "Sign in with Google",
    body:
      "One click. SecretForge provisions your private API key via Secret Labs.",
  },
  {
    num: "2",
    title: "Deploy your agent",
    body:
      "Pick OpenClaw or Hermes and your LLM. Your agent spins up in a SecretVM in minutes.",
  },
  {
    num: "3",
    title: "Connect your tools",
    body:
      "Add Gmail and other connectors. Tokens stay sealed in your enclave. Only you can reach them.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-portal-text">
            How it works
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
          {STEPS.map((step) => (
            <div key={step.num} className="relative md:pt-6">
              <div className="hidden md:block md:border-t md:border-portal-border" />
              <div className="text-4xl font-bold text-portal-accent">
                {step.num}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-portal-text">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-portal-muted">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
