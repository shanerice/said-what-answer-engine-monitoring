import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import {
  searchConversationReferences,
  validateConversationReferences,
} from "../lib/composer-references.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "list-brands",
  "create-brand",
  "ingest-sources",
  "get-source",
  "list-facts",
  "save-facts",
  "update-fact",
  "save-prompts",
  "run-probe",
  "list-probes",
  "save-findings",
  "get-monitor",
  "list-findings",
  "get-finding",
  "review-finding",
  "inspect-cited-page",
  "save-source-reviews",
  "save-remediation",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "said-what",
  mentionProviders: {
    chats: {
      label: "composerSources.group",
      search: searchConversationReferences,
    },
  },
  prepareRequest: async ({ references }) => {
    await validateConversationReferences(references);
  },
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the Said What agent. You check whether answer engines (ChatGPT-style assistants) state a brand's go-to-market facts correctly, and trace where wrong answers come from.

Workflow: ground truth from the brand's own pages (ingest-sources, get-source, save-facts) -> a human approves facts -> buyer questions (save-prompts) -> run-probe -> judge drift (list-probes, save-findings) -> a human confirms or dismisses each finding -> for confirmed findings only, source forensics (inspect-cited-page, save-source-reviews, save-remediation).

Rules:
- Load the gtm-fact-taxonomy skill before extracting facts, writing questions, or judging drift. Load the source-forensics skill before tracing sources.
- Every evidence quote must be verbatim from a stored source. Never invent facts, findings, signals or sources.
- Never confirm or dismiss a finding yourself (review-finding is the human's call) unless the user explicitly tells you their decision.
- Use neutral language: "differs from the published page", "suspected", "likely stale". Never call a site malicious or an attack.
- Remediation is a draft brief only. You never contact third parties.
- Inspect the current screen (view-screen) when the user says "this brand" or "this finding"; navigation carries brandId and findingId.`,
});
