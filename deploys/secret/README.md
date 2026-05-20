# Secret tier (placeholder)

This directory will contain the SecretAI-tier deploy template once
`qwen3.6:35b-a3b-bf16` is hosted on SecretAI in production-suitable
configuration. Mirror structure of `../byo/` with the SecretAI provider
replacing Anthropic.

Tracked in the v1 build plan as deferred. Activated when:

- `qwen3.6:35b-a3b-bf16` is available on SecretAI
- Hosting configuration delivers consistent latency (jedi-style, not
  rytn-style)
- Benchmark matrix confirms reliability matches the BYO tier
