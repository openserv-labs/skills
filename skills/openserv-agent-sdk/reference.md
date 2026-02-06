# OpenServ SDK Reference (v2.1)

Quick reference for common patterns.

## What's New in v2.1

- **Built-in Tunnel** - `run()` auto-connects to `agents-proxy.openserv.ai` for local dev
- **No Endpoint URL Needed** - Skip `endpointUrl` in `provision()` during development
- **Automatic Port Fallback** - If port 7378 is busy, finds an available one
- **Direct Credential Binding** - Pass `agent.instance` to `provision()` for automatic credential binding
- **`setCredentials()` Method** - Manually bind API key and auth token to agent

## Installation

```bash
npm install @openserv-labs/sdk @openserv-labs/client zod openai
```

## Minimal Agent

```typescript
import 'dotenv/config'
import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers } from '@openserv-labs/client'
import { z } from 'zod'

// 1. Define your agent
const agent = new Agent({
  systemPrompt: 'You are a helpful assistant.'
})

// 2. Add capabilities
agent.addCapability({
  name: 'greet',
  description: 'Greet a user',
  schema: z.object({ name: z.string() }),
  async run({ args }) {
    return `Hello, ${args.name}!`
  }
})

async function main() {
  // 3. Provision with agent instance binding (v2.1+)
  await provision({
    agent: {
      instance: agent, // Binds API key and auth token directly to agent
      name: 'my-agent',
      description: '...'
    },
    workflow: {
      name: 'Welcome Wizard',
      goal: 'Welcome users by name with a warm, personalized greeting message',
      trigger: triggers.webhook({ waitForCompletion: true })
    }
  })

  // 4. Run - auto-connects via agents-proxy.openserv.ai (no ngrok needed!)
  await run(agent)
}

main().catch(console.error)
```

> **Tip:** No need for ngrok or other tunneling tools - `run()` opens a tunnel automatically.

## Zod Schema Patterns

```typescript
// Required string
z.string().describe('Description')

// Optional with default
z.string().optional().default('value')

// Enum
z.enum(['a', 'b', 'c'])

// Number with constraints
z.number().min(1).max(100)

// Boolean
z.boolean().optional()

// Object
z.object({
  field: z.string(),
  nested: z.object({ sub: z.number() })
})

// Array
z.array(z.string())
```

## Trigger Types

```typescript
import { triggers } from '@openserv-labs/client'

// Webhook (free)
triggers.webhook({ waitForCompletion: true, timeout: 600 })

// x402 (paid)
triggers.x402({
  name: 'AI Service Name',
  description: 'What your service does',
  price: '0.01'
})

// Cron (scheduled)
triggers.cron({ schedule: '0 9 * * *' })

// Manual
triggers.manual()
```

## Multi-Agent Provision

`provision()` supports multi-agent workflows via `tasks` array and optional `agentIds`:

```typescript
const result = await provision({
  agent: { instance: agent, name: 'my-agent', description: '...' },
  workflow: {
    name: 'Supercharged Service Hub',
    goal: 'Execute a multi-agent pipeline where each step builds on the previous to deliver a complete service',
    trigger: triggers.x402({ name: 'Service', price: '0.01' }),
    tasks: [
      { name: 'step-1', description: 'First step' }, // assigned to provisioned agent
      { name: 'step-2', description: 'Second step', agentId: 1044 } // marketplace agent
    ]
    // edges auto-generated: trigger -> step-1 -> step-2
    // agentIds auto-derived from tasks
    // x402WalletAddress auto-injected from wallet
  }
})
```

- `task` (single) still works for backward compat
- `tasks` (array) enables multi-agent with per-task `agentId`
- `edges` are auto-generated sequentially if omitted
- `agentIds` are derived from tasks; explicit list adds extras (observers)
- x402 wallet address resolved automatically

See `openserv-multi-agent-workflows/examples/paid-image-pipeline.md` for a complete example.

## Agent Methods

```typescript
// In capability run function, use 'this':
async run({ args, action }) {
  // Tasks
  await this.addLogToTask({ workspaceId, taskId, severity: 'info', type: 'text', body: '...' })
  await this.updateTaskStatus({ workspaceId, taskId, status: 'in-progress' })
  await this.createTask({ workspaceId, assignee, description, body, input, dependencies })

  // Files
  await this.getFiles({ workspaceId })
  await this.uploadFile({ workspaceId, path, file })
  await this.deleteFile({ workspaceId, fileId })

  // Secrets
  await this.getSecrets({ workspaceId })
  await this.getSecretValue({ workspaceId, secretId })

  // Integrations
  await this.callIntegration({ workspaceId, integrationId, details: { endpoint, method, data } })
}
```

## Payments API (x402)

```typescript
import { PlatformClient } from '@openserv-labs/client'

const client = new PlatformClient()

// Discover x402 services
const services = await client.payments.discoverServices()

// Pay and execute an x402 workflow
const result = await client.payments.payWorkflow({
  triggerUrl: 'https://api.openserv.ai/webhooks/x402/trigger/...',
  input: { prompt: 'Hello' }
})

// Get trigger preflight info
const preflight = await client.payments.getTriggerPreflight({ token: '...' })
```

## Web3 API (Credits Top-up)

```typescript
// Top up credits with USDC (uses WALLET_PRIVATE_KEY env var)
const result = await client.web3.topUp({ amountUsd: 10 })
console.log(`Added ${result.creditsAdded} credits`)

// Lower-level methods
const config = await client.web3.getUsdcTopupConfig()
await client.web3.verifyUsdcTransaction({ txHash: '0x...', payerAddress: '0x...', signature: '0x...' })
```

## ERC-8004: On-Chain Registration

Register after `provision()`, before `run()`:

```typescript
import { PlatformClient } from '@openserv-labs/client'

const client = new PlatformClient()
await client.authenticate(process.env.WALLET_PRIVATE_KEY)

const erc8004 = await client.erc8004.registerOnChain({
  workflowId: result.workflowId,       // from provision()
  privateKey: process.env.WALLET_PRIVATE_KEY!,
  name: 'My Agent',
  description: 'What this agent does',
  // chainId: 8453,                     // Default: Base mainnet
  // rpcUrl: 'https://mainnet.base.org' // Default
})

erc8004.agentId          // "8453:42"
erc8004.txHash           // "0xabc..."
erc8004.blockExplorerUrl // "https://basescan.org/tx/..."
erc8004.agentCardUrl     // IPFS URL
erc8004.scanUrl          // "https://www.8004scan.io/agents/base/42"
```

- First run → `register()` (new mint). Re-runs → `setAgentURI()` (update, same ID).
- **Never clear wallet state** unless you want a new agent ID.

See **openserv-client** reference for full ERC-8004 API.

## Environment Variables

```env
OPENAI_API_KEY=your-key
OPENSERV_API_KEY=auto-populated
OPENSERV_AUTH_TOKEN=auto-populated
WALLET_PRIVATE_KEY=auto-populated (also used for x402 payments, USDC top-up, and ERC-8004 registration)
PORT=7378
```
