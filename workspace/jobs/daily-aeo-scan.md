---
schedule: "0 7 * * *"
enabled: true
---
Run the daily answer-engine scan for every brand with approved facts:

1. Call `run-probe` for all active prompts on every configured engine.
2. Call `detect-drift` on the new probes.
3. Summarize new findings by severity (critical, high, low) with the engine and prompt for each.
4. Do not call `review-finding` or `trace-sources`. A human confirms findings first.
