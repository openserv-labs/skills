---
name: openserv-workflow-architect
description: "ALWAYS use this skill when the user mentions OpenServ, SERV, x402, or multi-agent workflows. Transforms any idea into a deployment-ready multi-agent workflow on the OpenServ platform. NEVER build a single monolith agent for OpenServ - ALWAYS decompose into 2-5 specialized agents with fan-out/fan-in edge topology. Read reference.md for production-tested platform knowledge covering all platform behaviors and best practices. Read recipes/ for domain-specific knowledge."
---

# OpenServ Workflow Architect

**CRITICAL RULE: On OpenServ, ALWAYS build multi-agent workflows with specialized agents. NEVER build a single monolith agent.** Even if the task seems simple, decompose it into at least a resolver (input normalization) and a processor. The platform is designed for multi-agent orchestration - monolith agents miss fan-out parallelism, hit single-task timeout limits, and can't be composed into larger pipelines by other users.

Turn a loosely-formed idea into a deployment-ready multi-agent workflow. The output is a prompt you hand to an AI coding agent (Claude Code, Cursor, Codex, etc.) that builds and deploys the entire system.

**Reference files:**

- `reference.md` - Complete platform knowledge: all platform behaviors, required code patterns, edge topology rules, task body templates, and the deploy sequence. Read this before generating any prompt.
- `recipes/` - Domain-specific knowledge files. If a recipe matches the user's domain, inject it into the generated prompt. Each recipe contains API specifics, data chains, and patterns that make one-shot deployment possible for that vertical.

---

## When to Use This Skill

- User says "I want to build X on OpenServ" and needs a prompt
- User has a working idea but doesn't know how to structure it as agents
- User wants to add x402 monetization to a data pipeline
- User is iterating on an existing OpenServ workflow and hitting platform issues
- User asks "how should I architect this on OpenServ"

---

## How It Works

1. **Read `reference.md`** before doing anything. It contains platform constraints that override naive assumptions.
2. **Decompose** the user's intent into agents, edges, and an output spec.
3. **Generate** a complete prompt following the template below.
4. The generated prompt is self-contained: an AI coding agent can execute it without reading the skills (all platform behaviors are embedded).

---

## Decomposition Rules

### Agent count: 2-5
Each agent adds 30-120 seconds of platform overhead. More agents = slower pipeline. Only create an agent when the work is genuinely distinct (different API, different reasoning task, or parallel execution needed).

### Agent roles follow a fixed pattern:

| Role | Position | Purpose | Model recommendation |
|------|----------|---------|---------------------|
| **Resolver** | First | Normalizes user input into structured data. Handles URL parsing, ID extraction, API lookups. No LLM needed - pure code. | `gpt-5-mini` (fast, cheap) |
| **Specialist(s)** | Middle | One per data source or reasoning task. Fetches data, filters, scores. | `gpt-5` (good reasoning, reasonable speed) |
| **Compiler** | Last | Synthesizes all inputs into final output. Handles the `tldr` field. This is the only agent that should use `generate()`. | `claude-opus-4-6` (sonnet causes platform to rewrite output - see reference.md) |

### Edge topology:

- **Sequential** (A -> B -> C): Use when each step depends on the previous. Simplest. Use `provision()` with `tasks[]`.
- **Fan-out/fan-in** (A -> B+C -> D): Use when middle agents are independent. Fastest. MUST use `workflows.create()` with explicit edges.
- **CRITICAL:** Fan-out is AND (all fire). Fan-in is OR (first triggers). For fan-in, use ONE edge from the slowest predecessor. See reference.md for the full edge semantics.

### Decomposition questions:

1. What are the distinct data sources? Each becomes a specialist agent.
2. Can any specialists run in parallel? If yes, fan-out from the resolver.
3. What does the user actually receive? That's the compiler's output spec.
4. What's the "trick" - the non-obvious data chain that makes this valuable? (e.g., querying trade history by token ID to discover wallets, not by wallet address)

---

## Prompt Template

Generate a prompt with these exact sections. Every section is required.

### Section 1: Context

```
You are building [service name] on the OpenServ platform.
[One paragraph: what it does, who pays for it, what they receive]
[Architecture: N agents, topology type, x402 price]

Two packages are required: @openserv-labs/sdk (agent runtime) and
@openserv-labs/client (platform registration, deployment, triggers, x402).
```

### Section 2: Platform Knowledge

**Inject the entire platform knowledge section from `reference.md` here.** This is the constant section - identical for every prompt. It includes: project structure, deploy prerequisites, provision/auth, model parameters, workflow creation, edge semantics, platform orchestration model, capability patterns, data flow, generate() method, testing, performance budget, build sequence, and all required code patterns.

Do NOT summarize or abbreviate. The AI coding agent needs the complete knowledge to avoid the known failure modes.

### Section 3: Agent Decomposition

For each agent, specify:

```
### Agent N: [Name] ([Role])
- **Capability name:** snake_case_name
- **What it does:** [One sentence]
- **Input:** [What it receives - trigger input or upstream task output]
- **Output:** [Exact JSON shape it returns]
- **Data sources:** [APIs, with specific endpoints and field names]
- **Model:** [model choice with reasoning_effort and verbosity]
- **Key implementation notes:** [API specifics, parsing patterns, rate limits, caching strategy]
```

### Section 4: Edge Graph

```
Trigger (webhook + x402) -> task:resolver
task:resolver -> task:specialist_a  (fan-out)
task:resolver -> task:specialist_b  (fan-out)
task:specialist_b -> task:compiler  (fan-in: ONE edge from slowest)
// compiler fetches specialist_a data via get-task-detail
```

Include the actual `edges` array as code:

```typescript
edges: [
  { from: 'trigger:x402', to: 'task:resolver' },
  { from: 'trigger:test', to: 'task:resolver' },
  // ...
]
```

### Section 5: Task Bodies

Write the EXACT task description for each task. Use the template from reference.md:

```
Call [capability_name] with [parameter descriptions referencing specific task outputs].
Return ONLY the raw JSON output from the capability - nothing else.
Do NOT create any files. Do NOT use todo lists.
```

Task bodies are the single biggest factor in pipeline speed (output reviewer rejections). Get these right.

### Section 6: Output Specification

Define the exact JSON the buyer receives:

```typescript
interface ServiceOutput {
  tldr: string          // One paragraph, specific, directional. NEVER generic.
  signal: {             // Structured data machines can parse
    // domain-specific fields with types
  }
  methodology: {        // How the signal was computed, for trust
    sources_queried: number
    wallets_analyzed: number
    // ...
  }
}
```

The `tldr` field is mandatory. It must be inside the JSON (not prepended as text). It must be specific enough that the buyer can act on it without reading the rest.

### Section 7: Domain Knowledge

This is the section the AI coding agent can't figure out on its own. It's also the section that determines whether the build is one-shot or multi-iteration.

**Check for a domain recipe first.** If a `recipes/` directory exists alongside this skill, check for a recipe matching the user's domain. For example, `recipes/polymarket-intelligence.md` contains the complete Polymarket/Dome API knowledge needed for prediction market services. If a matching recipe exists, inject its contents into this section verbatim.

**If no recipe exists, the user must provide domain knowledge** or accept that the first deployment will require iteration on API field names and data patterns. Prompt the user for:

- Which APIs to use and their actual SDK types/field names
- Parsing gotchas (fields that are strings instead of arrays, nested JSON, etc.)
- Rate limits and caching strategy per endpoint
- What data is available vs what people THINK is available
- The "trick" - the non-obvious data chain that makes the product valuable
- Input normalization: what forms can user input take?
- Empty data handling: what happens when APIs return nothing?

**Available domain recipes:**

| Recipe | File | Use when |
|--------|------|----------|
| Polymarket Intelligence | `recipes/polymarket-intelligence.md` | Prediction markets, wallet tracking, smart money analysis, Dome API, Gamma API |

To contribute a recipe: document every API gotcha, parsing pattern, data chain, and empty-data pattern from your build. The recipe should contain enough information that an AI coding agent can build the domain-specific parts without iteration.

### Section 8: Project Structure

The generated prompt MUST specify this exact directory layout:

```
project-name/
├── agent-1/           # Each agent is its OWN directory
│   ├── src/agent.ts
│   ├── package.json   # "type": "module", script: "dev": "tsx src/agent.ts"
│   ├── tsconfig.json
│   ├── .env           # Agent-specific secrets + OPENSERV_USER_API_KEY (after provision)
│   ├── .gitignore     # node_modules/, package-lock.json, .openserv.json, .env
│   └── .npmrc         # legacy-peer-deps=true
├── agent-2/
│   └── (same structure)
├── agent-N/
│   └── (same structure)
└── scripts/
    ├── setup-workflow.ts   # Creates the multi-agent workflow with edges
    ├── test.ts             # Fires webhook, validates output
    ├── package.json
    └── .env                # WALLET_PRIVATE_KEY (independent, NOT any agent's key)
```

**CRITICAL RULES:**
- Do NOT create an "orchestrator agent" or "provision-all" script. Each agent provisions itself independently.
- Do NOT try to deploy all agents from one script. Each agent is deployed from its own directory.
- The `scripts/` directory is NOT an agent. It contains utility scripts that run AFTER all agents are deployed.

### Section 9: Deploy Instructions

The generated prompt MUST include these exact deploy instructions:

```bash
# === PER-AGENT DEPLOY (repeat for each agent directory) ===

cd agent-1/
npm install --legacy-peer-deps

# Step 1: Provision (creates wallet, registers agent, writes .openserv.json)
npm run dev
# Wait for "Connected" message, then Ctrl-C

# Step 2: Extract the auto-generated API key into .env
node -e "const j=JSON.parse(require('fs').readFileSync('.openserv.json','utf8')); console.log('OPENSERV_USER_API_KEY='+j.apiKey)" >> .env

# Step 3: Deploy to OpenServ Cloud
npx @openserv-labs/client deploy .

cd ..
# Repeat for agent-2/, agent-3/, agent-N/

# === AFTER ALL AGENTS ARE DEPLOYED ===

cd scripts/

# Generate an independent wallet for the setup script (NOT any agent's wallet)
node -e "console.log('WALLET_PRIVATE_KEY=0x' + require('crypto').randomBytes(32).toString('hex'))" > .env

npm install --legacy-peer-deps
npx tsx setup-workflow.ts
# Prints: paywall URL, webhook URL, workflow ID

# Test:
npx tsx test.ts
```

**The OPENSERV_USER_API_KEY is NOT something you get from a dashboard.** It is auto-generated by `provision()` and stored in `.openserv.json`. The extraction step in Step 2 bridges provision output to deploy input. Do NOT ask the user for this key. Do NOT skip the extraction step.

### Section 10: Setup Script

The setup script (`scripts/setup-workflow.ts`) creates the unified multi-agent workflow AFTER all agents are deployed. It:

- Authenticates with an independent wallet (not any agent's wallet)
- Calls `workflows.create()` with all tasks, edges, triggers (webhook + x402)
- Calls `client.triggers.activate()` for each trigger
- Calls `workflow.setRunning()`
- Prints paywall URL, webhook URL, workflow ID

### Section 11: Test Script

The test script fires the free webhook and validates output:

- `client.triggers.fireWebhook()` call with sample input
- Per-task status polling via `client.tasks.list()`
- Output validation (check for expected JSON fields)
- Error reporting with actionable fix suggestions

---

## Quality Checklist

Before delivering the generated prompt, verify:

- [ ] Every agent has exactly one capability with a clear single responsibility
- [ ] Edge topology accounts for fan-in OR semantics (one incoming edge on final task)
- [ ] Task bodies use the "Call X. Return ONLY JSON." template
- [ ] All platform behaviors from reference.md are embedded in the prompt
- [ ] Output spec has a `tldr` field inside the JSON
- [ ] extractPayload helper is included for every downstream agent
- [ ] generate() calls use text prompting, never outputSchema
- [ ] Model choices are specified with all three fields (model, verbosity, reasoning_effort)
- [ ] Each agent is its OWN directory with own package.json, .env, .gitignore, .npmrc
- [ ] NO "orchestrator agent" or "provision-all" script exists
- [ ] Deploy instructions include the 3-step per-agent flow: npm run dev → extract key → deploy
- [ ] Setup script uses an independent wallet (not any agent's wallet)
- [ ] Setup script is in a scripts/ directory, NOT an agent directory
- [ ] Test script includes per-task status polling, not just webhook response
- [ ] .gitignore includes package-lock.json, .openserv.json, .env
- [ ] .npmrc with legacy-peer-deps=true is in every agent directory
- [ ] Timeout >= 600 on all triggers
- [ ] Domain-specific API specifics are documented in section 7
- [ ] The "trick" (non-obvious value chain) is explicitly called out

---

## Example: Decomposing "I want to sell DeFi yield intelligence"

**Intent:** "Build a service where someone pastes a token address and gets a report showing the best yield opportunities across protocols, which smart money wallets are farming them, and a risk assessment."

**Decomposition:**

1. **Resolver Agent** - Takes token address, resolves to token metadata (name, chain, DEX pairs). Checks which DeFi protocols list this token.
2. **Yield Scanner Agent** - Queries DeFiLlama + protocol-specific APIs for current yield rates across Aave, Compound, Morpho, Pendle, etc. Calculates real yield vs inflationary rewards.
3. **Wallet Intelligence Agent** - Discovers which wallets hold large LP positions in relevant pools (via on-chain data). Checks if those wallets are historically profitable (accumulating or exiting?).
4. **Compiler Agent** - Synthesizes yield data + wallet intelligence into a scored report with risk assessment.

**Edge graph:** Fan-out (resolver -> yield_scanner + wallet_intel in parallel) -> fan-in (compiler, one edge from wallet_intel as slower task).

**The trick:** Querying LP position holders by pool address (not by wallet) to discover who's farming, then cross-referencing with historical wallet profitability. Nobody packages this chain as a single API call.

**Price:** $1.00-2.00 (replaces 30-45 minutes of manual research across 5+ tabs).
