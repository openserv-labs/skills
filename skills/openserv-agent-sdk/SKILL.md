---
name: openserv-agent-sdk
description: Build and deploy autonomous AI agents using the OpenServ SDK (@openserv-labs/sdk). IMPORTANT - Always read the companion skill openserv-client alongside this skill, as both packages are required to build and run agents. openserv-client covers the full Platform API for multi-agent workflows and ERC-8004 on-chain identity. Read reference.md for the full API reference.
---

# OpenServ Agent SDK

Build and deploy custom AI agents for the OpenServ platform using TypeScript.

## Why build an agent?

An OpenServ agent is a service that runs your code and exposes it on the OpenServ platform—so it can be triggered by workflows, other agents, or paid calls (e.g. x402). The platform sends tasks to your agent; your agent runs your capabilities (APIs, tools, file handling) and returns results. You don't have to use an LLM—e.g. it could be a static API that just returns data—but you'll often want one for reasoning and choosing which capabilities to call; in that case you bring your own—any LLM you have access to (we show OpenAI and Anthropic in examples).

## How it works (the flow)

1. **Define your agent** — System prompt plus _capabilities_ (named functions with a Zod schema and a `run` handler). If you use an LLM, it uses the prompt and capability descriptions to choose when and how to call each capability.
2. **Register with the platform** — You need an account on the platform; often the easiest way is to let `provision()` create one for you automatically by creating a wallet and signing up with it (that account is reused on later runs). Call `provision()` (from `@openserv-labs/client`): it creates or reuses a wallet, registers the agent, and writes API key and auth token into your env (or you pass `agent.instance` to bind them directly). In development you can skip setting an endpoint URL; the SDK can use a built-in tunnel to the platform.
3. **Start the agent** — Call `run(agent)`. The agent listens for tasks, runs your capabilities (and your LLM if you use one), and responds. Use `reference.md` and `troubleshooting.md` for details; `examples/` has full runnable code.

## What your agent can do

- **Capabilities** — The tools your agent can run (e.g. search, transform data, call APIs). Each has a name, description, schema, and `run()` function.
- **Task context** — When running in a task, the agent can attach logs and uploads to that task via methods like `addLogToTask()` and `uploadFile()`.
- **Multi-agent workflows** — Your agent can be part of workflows with other agents; see the **openserv-client** skill for the Platform API, workflows, and ERC-8004 on-chain identity.

**Reference:** `reference.md` (patterns) · `troubleshooting.md` (common issues) · `examples/` (full examples)

## Quick Start

### Installation

```bash
npm install @openserv-labs/sdk @openserv-labs/client zod openai
```

> **Note:** The SDK requires `openai@^5.x` as a peer dependency.

### Minimal Agent

See `examples/basic-agent.ts` for a complete runnable example.

The pattern is simple:

1. Create an `Agent` with a system prompt
2. Add capabilities with `agent.addCapability()`
3. Call `provision()` to register on the platform (pass `agent.instance` to bind credentials)
4. Call `run(agent)` to start

---

## Complete Agent Template

### File Structure

```
my-agent/
├── src/agent.ts
├── .env
├── .gitignore
├── package.json
└── tsconfig.json
```

### Dependencies

```bash
npm init -y && npm pkg set type=module
npm i @openserv-labs/sdk @openserv-labs/client dotenv openai zod
npm i -D @types/node tsx typescript
```

> **Note:** The project must use `"type": "module"` in `package.json`. Add a `"dev": "tsx src/agent.ts"` script for local development.

### .env

An agent doesn't require an LLM—it could be a static API that just returns results. If you do use an LLM (e.g. for reasoning and text generation), you bring your own—any provider you have access to. The examples below use OpenAI and Anthropic; set the API key for whichever you use. The rest is filled by `provision()`.

```env
OPENAI_API_KEY=your-openai-key
# ANTHROPIC_API_KEY=your_anthropic_key  # If using Claude
# Auto-populated by provision():
WALLET_PRIVATE_KEY=
OPENSERV_API_KEY=
OPENSERV_AUTH_TOKEN=
PORT=7378
# Production: skip tunnel and run HTTP server only
# DISABLE_TUNNEL=true
# Force tunnel even when endpointUrl is set
# FORCE_TUNNEL=true
```

---

## Capabilities

Capabilities are functions your agent can execute. Each requires:

- `name` - Unique identifier
- `description` - What it does (helps AI decide when to use it)
- `schema` - Zod schema defining parameters
- `run` - Function returning a string

See `examples/capability-example.ts` for basic capabilities.

### Using Agent Methods

Access `this` in capabilities to use agent methods like `addLogToTask()`, `uploadFile()`, etc.

See `examples/capability-with-agent-methods.ts` for logging and file upload patterns.

---

## Agent Methods

### Task Management

```typescript
await agent.createTask({ workspaceId, assignee, description, body, input, dependencies })
await agent.updateTaskStatus({ workspaceId, taskId, status: 'in-progress' })
await agent.addLogToTask({ workspaceId, taskId, severity: 'info', type: 'text', body: '...' })
await agent.markTaskAsErrored({ workspaceId, taskId, error: 'Something went wrong' })
const task = await agent.getTaskDetail({ workspaceId, taskId })
const tasks = await agent.getTasks({ workspaceId })
```

### File Operations

```typescript
const files = await agent.getFiles({ workspaceId })
await agent.uploadFile({ workspaceId, path: 'output.txt', file: 'content', taskIds: [taskId] })
await agent.deleteFile({ workspaceId, fileId })
```

---

## Action Context

The `action` parameter in capabilities is a **union type** — `task` only exists on the `'do-task'` variant. Always narrow with a type guard before accessing `action.task`:

```typescript
async run({ args, action }) {
  // action.task does NOT exist on all action types — you must narrow first
  if (action?.type === 'do-task' && action.task) {
    const { workspace, task } = action
    workspace.id        // Workspace ID
    workspace.goal      // Workspace goal
    task.id             // Task ID
    task.description    // Task description
    task.input          // Task input
    action.me.id        // Current agent ID
  }
}
```

**Do not** extract `action?.task?.id` before the type guard — TypeScript will error with `Property 'task' does not exist on type 'ActionSchema'`.

---

## Workflow Name & Goal

The `workflow` object in `provision()` requires two important properties:

- **`name`** (string) - This becomes the **agent name in ERC-8004**. Make it polished, punchy, and memorable — this is the public-facing brand name users see. Think product launch, not variable name. Examples: `'Crypto Alpha Scanner'`, `'AI Video Studio'`, `'Instant Blog Machine'`.
- **`goal`** (string, required) - A detailed description of what the workflow accomplishes. Must be descriptive and thorough — short or vague goals will cause API calls to fail. Write at least a full sentence explaining the workflow's purpose.

```typescript
workflow: {
  name: 'Haiku Poetry Generator',  // Polished display name — the ERC-8004 agent name users see
  goal: 'Transform any theme or emotion into a beautiful traditional 5-7-5 haiku poem using AI',
  trigger: triggers.x402({ ... }),
  task: { description: 'Generate a haiku about the given topic' }
}
```

---

## Trigger Types

```typescript
import { triggers } from '@openserv-labs/client'

triggers.webhook({ waitForCompletion: true, timeout: 600 })
triggers.x402({ name: '...', description: '...', price: '0.01', timeout: 600 })
triggers.cron({ schedule: '0 9 * * *' })
triggers.manual()
```

> **Important:** Always set `timeout` to at least **600 seconds** (10 minutes) for webhook and x402 triggers. Agents often take significant time to process requests — especially when performing research, content generation, or other complex tasks. A low timeout will cause premature failures. For multi-agent pipelines with many sequential steps, consider 900 seconds or more.

---

## Deployment

### Local Development

```bash
npm run dev
```

The `run()` function automatically:

- Starts the agent HTTP server (port 7378, with automatic fallback)
- Connects via WebSocket to `agents-proxy.openserv.ai`
- Routes platform requests to your local machine

**No need for ngrok or other tunneling tools** - `run()` handles this seamlessly. Just call `run(agent)` and your local agent is accessible to the platform.

### Production

When deploying to a hosting provider like Cloud Run, set `DISABLE_TUNNEL=true` as an environment variable. This makes `run()` start only the HTTP server without opening a WebSocket tunnel — the platform reaches your agent directly at its public URL.

```typescript
await provision({
  agent: {
    name: 'my-agent',
    description: '...',
    endpointUrl: 'https://my-agent.example.com' // Required for production
  },
  workflow: {
    name: 'Lightning Service Pro',
    goal: 'Describe in detail what this workflow does — be thorough, vague goals cause failures',
    trigger: triggers.webhook({ waitForCompletion: true, timeout: 600 }),
    task: { description: 'Process incoming requests' }
  }
})

// With DISABLE_TUNNEL=true, run() starts only the HTTP server (no tunnel)
await run(agent)
```

---

## ERC-8004: On-Chain Agent Identity

After provisioning, register your agent on-chain for discoverability via the Identity Registry.

> **Requires ETH on Base.** Registration calls `register()` on the ERC-8004 contract on **Base mainnet (chain 8453)**, which costs gas. The wallet created by `provision()` starts with a zero balance. Fund it with a small amount of ETH on Base before the first registration attempt. The wallet address is logged during provisioning (`Created new wallet: 0x...`).

> **Always wrap in try/catch** so a registration failure (e.g. unfunded wallet) doesn't prevent `run(agent)` from starting.

Two important patterns:

1. **Use `dotenv` programmatically** (not `import 'dotenv/config'`) so you can reload `.env` after `provision()` writes `WALLET_PRIVATE_KEY`.
2. **Call `dotenv.config({ override: true })` after `provision()`** to pick up the freshly written key before ERC-8004 registration.

```typescript
import dotenv from 'dotenv'
dotenv.config()

import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers, PlatformClient } from '@openserv-labs/client'

// ... define agent and capabilities ...

const result = await provision({
  agent: { instance: agent, name: 'my-agent', description: '...' },
  workflow: {
    name: 'My Service',
    goal: 'Detailed description of what the workflow does',
    trigger: triggers.x402({ name: 'My Service', description: '...', price: '0.01', timeout: 600 }),
    task: { description: 'Process requests' }
  }
})

// Reload .env to pick up WALLET_PRIVATE_KEY written by provision()
dotenv.config({ override: true })

// Register on-chain (non-blocking — requires funded wallet on Base)
try {
  const client = new PlatformClient()
  await client.authenticate(process.env.WALLET_PRIVATE_KEY)

  const erc8004 = await client.erc8004.registerOnChain({
    workflowId: result.workflowId,
    privateKey: process.env.WALLET_PRIVATE_KEY!,
    name: 'My Service',
    description: 'What this agent does'
  })

  console.log(`Agent ID: ${erc8004.agentId}`) // "8453:42"
  console.log(`TX: ${erc8004.blockExplorerUrl}`)
  console.log(`Scan: ${erc8004.scanUrl}`) // "https://www.8004scan.io/agents/base/42"
} catch (error) {
  console.warn('ERC-8004 registration skipped:', error instanceof Error ? error.message : error)
}

await run(agent)
```

- **First run** mints a new identity NFT. **Re-runs update the URI** — agent ID stays the same.
- **Never clear the wallet state** unless you intentionally want a new agent ID. To update metadata, just re-run.
- Default chain: Base mainnet (8453). Pass `chainId` / `rpcUrl` for others.

See **openserv-client** skill for the full ERC-8004 API reference and troubleshooting.

---

## DO NOT USE

- **`this.process()`** inside capabilities - Use direct OpenAI calls instead
- **`doTask` override** - The SDK handles task execution automatically
- **`this.completeTask()`** - Task completion is handled by the Runtime API

---

## Updating This Skill

This skill may be outdated. The OpenServ team ships updates regularly—new features, API changes, and bug fixes won't be reflected here until you update. **If something isn't working as expected, or you want to make sure you have the latest information, update the skill before proceeding.**

```bash
# Check if updates are available
npx skills check

# Update all installed skills to latest versions
npx skills update
```

Or reinstall the OpenServ skills directly:

```bash
npx skills add openserv-labs/skills
```

---

## Related Skills

- **openserv-client** - Full Platform Client API reference
- **openserv-multi-agent-workflows** - Multi-agent collaboration patterns
- **openserv-launch** - Launch tokens on Base blockchain
- **openserv-ideaboard-api** - Find ideas and ship agent services on the Ideaboard
