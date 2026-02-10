---
name: openserv-client
description: Complete guide to using @openserv-labs/client for managing agents, workflows, triggers, and tasks on the OpenServ Platform. Covers provisioning, authentication, x402 payments, ERC-8004 on-chain identity, and the full Platform API. IMPORTANT - Always read the companion skill openserv-agent-sdk alongside this skill, as both packages are required to build any agent. Read reference.md for the full API reference.
---

# OpenServ Client

The `@openserv-labs/client` package provides a TypeScript client for the OpenServ Platform API.

**Reference files:**

- `reference.md` - Full API reference for all PlatformClient methods
- `troubleshooting.md` - Common issues and solutions
- `examples/` - Complete code examples

## Installation

```bash
npm install @openserv-labs/client
```

---

## Quick Start: Just `provision()` + `run()`

**The simplest deployment is just two calls: `provision()` and `run()`.** That's it.

See `examples/agent.ts` for a complete runnable example.

> **Key Point:** `provision()` is **idempotent**. Call it every time your app starts - no need to check `isProvisioned()` first.

### What `provision()` Does

1. Creates/retrieves an Ethereum wallet for authentication
2. Authenticates with the OpenServ platform
3. Creates or updates the agent (idempotent)
4. Generates API key and auth token
5. **Binds credentials to agent instance** (if `agent.instance` is provided)
6. Creates or updates the workflow with trigger and task
7. Creates workflow graph (edges linking trigger to task)
8. Activates trigger and sets workflow to running
9. Persists state to `.openserv.json`

### Workflow Name & Goal

The `workflow` config requires two important properties:

- **`name`** (string) - This becomes the **agent name in ERC-8004**. Make it polished, punchy, and memorable — this is the public-facing brand name users see. Think product launch, not variable name. Examples: `'Viral Content Engine'`, `'Crypto Alpha Scanner'`, `'Life Catalyst Pro'`.
- **`goal`** (string, required) - A detailed description of what the workflow accomplishes. Must be descriptive and thorough — short or vague goals will cause API calls to fail. Write at least a full sentence explaining the workflow's purpose.

```typescript
workflow: {
  name: 'Deep Research Pro',
  goal: 'Research any topic in depth, synthesize findings from multiple sources, and produce a comprehensive report with citations',
  trigger: triggers.webhook({ waitForCompletion: true, timeout: 600 }),
  task: { description: 'Research the given topic' }
}
```

### Agent Instance Binding (v1.1+)

Pass your agent instance to `provision()` for automatic credential binding:

```typescript
const agent = new Agent({ systemPrompt: '...' })

await provision({
  agent: {
    instance: agent, // Calls agent.setCredentials() automatically
    name: 'my-agent',
    description: '...'
  },
  workflow: { ... }
})

// agent now has apiKey and authToken set - ready for run()
await run(agent)
```

This eliminates the need to manually set `OPENSERV_API_KEY` environment variables.

### Provision Result

```typescript
interface ProvisionResult {
  agentId: number
  apiKey: string
  authToken?: string
  workflowId: number
  triggerId: string
  triggerToken: string
  paywallUrl?: string // For x402 triggers
  apiEndpoint?: string // For webhook triggers
}
```

---

## PlatformClient: Full API Access

For advanced use cases, use `PlatformClient` directly:

```typescript
import { PlatformClient } from '@openserv-labs/client'

// Using API key
const client = new PlatformClient({
  apiKey: process.env.OPENSERV_USER_API_KEY
})

// Or using wallet authentication
const client = new PlatformClient()
await client.authenticate(process.env.WALLET_PRIVATE_KEY)
```

See `reference.md` for full API documentation on:

- `client.agents.*` - Agent management (create, update, delete, `model_parameters`)
- `client.models.*` - Discover available LLM models and their parameter schemas
- `client.workflows.*` - Workflow management
- `client.triggers.*` - Trigger management
- `client.tasks.*` - Task management
- `client.integrations.*` - Integration connections
- `client.payments.*` - x402 payments
- `client.web3.*` - Credits top-up

---

## Triggers Factory

Use the `triggers` factory for type-safe trigger configuration:

```typescript
import { triggers } from '@openserv-labs/client'

// Webhook (free, public endpoint)
triggers.webhook({
  input: { query: { type: 'string', description: 'Search query' } },
  waitForCompletion: true,
  timeout: 600
})

// x402 (paid API with paywall)
triggers.x402({
  name: 'AI Research Assistant',
  description: 'Get comprehensive research reports on any topic',
  price: '0.01',
  timeout: 600,
  input: {
    prompt: {
      type: 'string',
      title: 'Your Request',
      description: 'Describe what you would like the agent to do'
    }
  }
})

// Cron (scheduled)
triggers.cron({
  schedule: '0 9 * * *', // Daily at 9 AM
  timezone: 'America/New_York'
})

// Manual (platform UI only)
triggers.manual()
```

### Timeout

> **Important:** Always set `timeout` to at least **600 seconds** (10 minutes) for webhook and x402 triggers. Agents often take significant time to process requests — especially in multi-agent workflows or when performing research, content generation, or other complex tasks. A low timeout (e.g., 180s) will cause premature failures. When in doubt, err on the side of a longer timeout. For multi-agent pipelines with many sequential steps, consider 900 seconds or more.

### Input Schema

Define fields for webhook/x402 paywall UI:

```typescript
triggers.x402({
  name: 'Content Writer',
  description: 'Generate polished content on any topic',
  price: '0.01',
  input: {
    topic: {
      type: 'string',
      title: 'Content Topic',
      description: 'Enter the subject you want covered'
    },
    style: {
      type: 'string',
      title: 'Writing Style',
      enum: ['formal', 'casual', 'humorous'],
      default: 'casual'
    }
  }
})
```

### Cron Expressions

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sunday=0)
* * * * *
```

Common: `0 9 * * *` (daily 9 AM), `*/5 * * * *` (every 5 min), `0 9 * * 1-5` (weekdays 9 AM)

---

## State Management

```typescript
import { getProvisionedInfo, clearProvisionedState } from '@openserv-labs/client'

// Get stored IDs and tokens
const info = getProvisionedInfo('my-agent', 'My Awesome Workflow')

// Clear state (forces fresh creation)
clearProvisionedState()
```

---

## Discovering & Firing x402 Services

### Discover Available Services (No Auth Required)

`discoverServices()` lists all public x402-enabled workflows. **No authentication is needed** — you can call it on a bare `PlatformClient`:

```typescript
import { PlatformClient } from '@openserv-labs/client'

const client = new PlatformClient() // no API key or wallet needed
const services = await client.payments.discoverServices()

for (const service of services) {
  console.log(`${service.name}: $${service.x402Pricing}`)
  console.log(`URL: ${service.webhookUrl}`)
}
```

### Firing Triggers

#### Webhook

```typescript
// By workflow ID (recommended)
const result = await client.triggers.fireWebhook({
  workflowId: 123,
  input: { query: 'hello world' }
})

// Or by direct URL
const result = await client.triggers.fireWebhook({
  triggerUrl: 'https://api.openserv.ai/webhooks/trigger/TOKEN',
  input: { query: 'hello world' }
})
```

#### x402 (Programmatic)

```typescript
// By workflow ID (recommended)
const result = await client.payments.payWorkflow({
  workflowId: 123,
  input: { prompt: 'Hello world' }
})

// Or by direct URL
const result = await client.payments.payWorkflow({
  triggerUrl: 'https://api.openserv.ai/webhooks/x402/trigger/TOKEN',
  input: { prompt: 'Hello world' }
})
```

---

## Environment Variables

| Variable                | Description                  | Required |
| ----------------------- | ---------------------------- | -------- |
| `OPENSERV_USER_API_KEY` | User API key (from platform) | Yes\*    |
| `WALLET_PRIVATE_KEY`    | Wallet for SIWE auth         | Yes\*    |
| `OPENSERV_API_URL`      | Custom API URL               | No       |

\*Either API key or wallet key required

---

## ERC-8004: On-Chain Agent Identity

Register your agent on-chain after provisioning. This mints an NFT on the Identity Registry and publishes your agent's service endpoints to IPFS.

> **Requires ETH on Base.** The wallet created by `provision()` starts with zero balance. Fund it with a small amount of ETH on Base mainnet before registration. Always wrap in try/catch so failures don't prevent `run(agent)` from starting.

> **Reload `.env` after `provision()`.** `provision()` writes `WALLET_PRIVATE_KEY` to `.env` at runtime, but `process.env` already loaded the empty value at startup. Use `dotenv.config({ override: true })` after `provision()` to pick up the freshly written key. See **openserv-agent-sdk** skill for the full dotenv pattern.

```typescript
import { PlatformClient } from '@openserv-labs/client'

// Reload .env to pick up WALLET_PRIVATE_KEY written by provision()
dotenv.config({ override: true })

try {
  const client = new PlatformClient()
  await client.authenticate(process.env.WALLET_PRIVATE_KEY)

  const erc8004 = await client.erc8004.registerOnChain({
    workflowId: result.workflowId,
    privateKey: process.env.WALLET_PRIVATE_KEY!,
    name: 'My Agent',
    description: 'What this agent does',
  })

  console.log(`Agent ID: ${erc8004.agentId}`)         // "8453:42"
  console.log(`Explorer: ${erc8004.blockExplorerUrl}`)
  console.log(`Scan: ${erc8004.scanUrl}`)              // "https://www.8004scan.io/agents/base/42"
} catch (error) {
  console.warn('ERC-8004 registration skipped:', error instanceof Error ? error.message : error)
}
```

- **First run** mints a new NFT. **Re-runs update the URI** — agent ID stays the same.
- Default chain is Base mainnet (8453). Pass `chainId` and `rpcUrl` for other chains.
- **Never clear the wallet state** unless you intentionally want a new agent ID.

See `reference.md` for the full ERC-8004 API (wallet management, chain helpers, troubleshooting).

---

## Cleanup

```typescript
await client.workflows.delete({ id: workflowId })
await client.agents.delete({ id: agentId })
clearProvisionedState()
```

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

- **openserv-agent-sdk** - Building agents with capabilities
- **openserv-multi-agent-workflows** - Multi-agent collaboration patterns
- **openserv-launch** - Launch tokens on Base blockchain
- **openserv-ideaboard-api** - Find ideas and ship agent services on the Ideaboard
