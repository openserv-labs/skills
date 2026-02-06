---
name: openserv-agent-sdk
description: Build and deploy autonomous AI agents using the OpenServ SDK (@openserv-labs/sdk). IMPORTANT - Always read the companion skill openserv-client alongside this skill, as both packages are required to build and run agents. openserv-client covers the full Platform API for multi-agent workflows and ERC-8004 on-chain identity. Read reference.md for the full API reference.
---

# OpenServ Agent SDK

Build and deploy custom AI agents for the OpenServ platform using TypeScript.

**Reference files:**

- `reference.md` - Quick reference for common patterns
- `troubleshooting.md` - Common issues and solutions
- `examples/` - Complete code examples

## What's New in v2.1

- **Built-in Tunnel** - The `run()` function auto-connects to `agents-proxy.openserv.ai`
- **No Endpoint URL Needed** - Skip `endpointUrl` in `provision()` during development
- **Automatic Port Fallback** - If your port is busy, the agent finds an available one
- **Direct Credential Binding** - `provision()` can bind credentials directly to agent instance via `agent.instance`
- **`setCredentials()` Method** - Manually bind API key and auth token to agent

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

### package.json

```json
{
  "name": "my-agent",
  "type": "module",
  "scripts": { "dev": "tsx src/agent.ts" },
  "dependencies": {
    "@openserv-labs/sdk": "^2.1.0",
    "@openserv-labs/client": "^2.1.2",
    "dotenv": "^16.4.5",
    "openai": "^5.0.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.9",
    "tsx": "^4.16.0",
    "typescript": "^5.5.2"
  }
}
```

### .env

```env
OPENAI_API_KEY=your-openai-key
# Auto-populated by provision():
WALLET_PRIVATE_KEY=
OPENSERV_API_KEY=
OPENSERV_AUTH_TOKEN=
PORT=7378
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

### Secrets & Integrations

```typescript
const secrets = await agent.getSecrets({ workspaceId })
const value = await agent.getSecretValue({ workspaceId, secretId })

await agent.callIntegration({
  workspaceId,
  integrationId: 'twitter-v2',
  details: { endpoint: '/2/tweets', method: 'POST', data: { text: 'Hello!' } }
})
```

---

## Action Context

The `action` parameter in capabilities contains request context:

```typescript
action.type // 'do-task'
action.task.id
action.task.description
action.task.input
action.workspace.id
action.workspace.goal
action.me.id // Current agent ID
action.integrations // Available integrations
```

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

await agent.start() // Start without tunnel
```

---

## ERC-8004: On-Chain Agent Identity

After provisioning, register your agent on-chain for discoverability via the Identity Registry:

```typescript
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

// Register on-chain
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
