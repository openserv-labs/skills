# OpenServ Client API Reference

Detailed API reference for PlatformClient methods.

For complete examples, see `examples/` folder.

## Provision API

The `provision()` function is the recommended way to deploy agents:

```typescript
import { provision, triggers } from '@openserv-labs/client'
import { Agent, run } from '@openserv-labs/sdk'

const agent = new Agent({ systemPrompt: '...' })

const result = await provision({
  agent: {
    instance: agent, // Binds credentials directly to agent (v1.1+)
    name: 'my-agent',
    description: 'Agent capabilities'
    // endpointUrl: 'https://...' // Optional for dev, required for production
  },
  workflow: {
    name: 'default',
    trigger: triggers.webhook({ waitForCompletion: true }),
    task: { description: 'Process requests' }
  }
})

// result contains: agentId, apiKey, authToken, workflowId, triggerId, etc.
await run(agent)
```

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

## Agents API

```typescript
// List YOUR OWN agents
const agents = await client.agents.list()

// Search YOUR OWN agents by name/description
const myAgents = await client.agents.searchOwned({ query: 'my-agent' })

// Search ALL PUBLIC marketplace agents (semantic search)
const marketplace = await client.agents.listMarketplace({
  search: 'data processing',
  page: 1,
  pageSize: 20,
  showPrivateAgents: true
})
// Returns: { items: Agent[], total: number }

// Get agent by ID
const agent = await client.agents.get({ id: 123 })

// Create an agent
const agent = await client.agents.create({
  name: 'My Agent',
  capabilities_description: 'Processes data and generates reports',
  endpoint_url: 'https://my-agent.example.com'
})

// Update an agent
await client.agents.update({
  id: 123,
  name: 'Updated Name',
  endpoint_url: 'https://new-endpoint.com'
})

// Delete an agent
await client.agents.delete({ id: 123 })

// Get agent API key
const apiKey = await client.agents.getApiKey({ id: 123 })

// Generate and save auth token
const { authToken, authTokenHash } = await client.agents.generateAuthToken()
await client.agents.saveAuthToken({ id: 123, authTokenHash })
```

---

## Workflows API

```typescript
// Create a workflow
const workflow = await client.workflows.create({
  name: 'Data Pipeline',
  goal: 'Process and analyze incoming data',
  agentIds: [123, 456]
})

// Get a workflow
const workflow = await client.workflows.get({ id: 789 })

// List all workflows
const workflows = await client.workflows.list()

// Update a workflow
await client.workflows.update({
  id: 789,
  name: 'Updated Pipeline',
  goal: 'New goal description'
})

// Delete a workflow
await client.workflows.delete({ id: 789 })

// Set workflow to running state
await client.workflows.setRunning({ id: 789 })

// Add an agent to an existing workspace
await client.workflows.addAgent({ id: 789, agentId: 456 })
```

### Declarative Workflow Sync

```typescript
await client.workflows.sync({
  id: 789,
  triggers: [triggers.webhook({ name: 'api' })],
  tasks: [
    { name: 'process', agentId: 123, description: 'Process the data' },
    { name: 'report', agentId: 456, description: 'Generate report' }
  ],
  edges: [
    { from: 'trigger:api', to: 'task:process' },
    { from: 'task:process', to: 'task:report' }
  ]
})
```

### Branching Workflows with Output Options

Tasks can define multiple output options for branching logic:

```typescript
await client.workflows.sync({
  id: 789,
  triggers: [triggers.webhook({ name: 'webhook' })],
  tasks: [
    {
      name: 'review',
      agentId: reviewerAgent,
      description: 'Review and decide on the submission',
      outputOptions: {
        approved: {
          name: 'Approved',
          type: 'text',
          instructions: 'Mark as approved with notes'
        },
        rejected: {
          name: 'Rejected',
          type: 'text',
          instructions: 'Mark as rejected with reason'
        }
      }
    },
    { name: 'process-approved', agentId: processorAgent, description: 'Process approved item' },
    { name: 'handle-rejection', agentId: rejectionAgent, description: 'Handle rejected item' }
  ],
  edges: [
    { from: 'trigger:webhook', to: 'task:review' },
    { from: 'task:review', to: 'task:process-approved', sourcePort: 'approved' },
    { from: 'task:review', to: 'task:handle-rejection', sourcePort: 'rejected' }
  ]
})
```

### Workflow Object Methods

```typescript
const workflow = await client.workflows.get({ id: 789 })

workflow.id
workflow.name
workflow.status // 'draft', 'running', etc.
workflow.triggers
workflow.tasks
workflow.edges
workflow.agents // Array of agents in the workspace

await workflow.addAgent(456)   // Add an agent to the workspace
await workflow.sync({ tasks: [...] })
await workflow.setRunning()
```

> **Note:** `sync()` automatically adds any agents referenced in tasks that aren't already in the workspace. You only need to call `addAgent()` explicitly if you want to add an agent without assigning it to a task.

---

## Triggers API

```typescript
// Get integration connection
const connId = await client.integrations.getOrCreateConnection('webhook-trigger')

// Create trigger
const trigger = await client.triggers.create({
  workflowId: 789,
  name: 'API Endpoint',
  integrationConnectionId: connId,
  props: { waitForCompletion: true, timeout: 180 }
})

// Get trigger (includes token)
const trigger = await client.triggers.get({ workflowId: 789, id: 'trigger-id' })

// List triggers
const allTriggers = await client.triggers.list({ workflowId: 789 })

// Update trigger
await client.triggers.update({
  workflowId: 789,
  id: 'trigger-id',
  props: { timeout: 600 }
})

// Activate trigger
await client.triggers.activate({ workflowId: 789, id: 'trigger-id' })

// Fire trigger manually
await client.triggers.fire({
  workflowId: 789,
  id: 'trigger-id',
  input: JSON.stringify({ query: 'test' })
})

// Delete trigger
await client.triggers.delete({ workflowId: 789, id: 'trigger-id' })
```

### Webhook/x402 URLs

```typescript
const trigger = await client.triggers.get({ workflowId, id: triggerId })

// Webhook URL
const webhookUrl = `https://api.openserv.ai/webhooks/trigger/${trigger.token}`

// x402 URL
const x402Url = `https://api.openserv.ai/x402/trigger/${trigger.token}`

// Paywall page (x402 only)
const paywallUrl = `https://platform.openserv.ai/workspace/paywall/${trigger.token}`
```

### x402 Wallet Address Resolution

x402 triggers require an `x402WalletAddress` for payout. When using `workflows.create()`, `workflow.sync()`, or `provision()`, this is resolved automatically via a fallback chain:

1. **`x402WalletAddress` on the trigger config** -- per-trigger override (highest priority)
2. **`client.walletAddress`** -- set automatically by `client.authenticate(privateKey)`
3. **`process.env.WALLET_PRIVATE_KEY`** -- address derived from the env variable

```typescript
// Per-trigger override (different triggers, different wallets):
triggers: [
  triggers.x402({ price: '0.01', walletAddress: '0x...custom-payout-address' })
]
```

`client.resolveWalletAddress()` returns the resolved address (or `undefined` if no wallet is available).

### agentIds Derivation

`WorkflowConfig.agentIds` is optional. If omitted, agent IDs are derived from `tasks[].agentId`. If provided, they are merged with task-derived IDs:

```typescript
// No explicit agentIds -- derived from tasks automatically
const workflow = await client.workflows.create({
  name: 'Pipeline',
  goal: 'Process data',
  tasks: [
    { name: 'step1', agentId: 123, description: 'First step' },
    { name: 'step2', agentId: 456, description: 'Second step' }
  ]
})
// Workspace automatically includes agents 123 and 456
```

---

## Tasks API

```typescript
// Create a task
const task = await client.tasks.create({
  workflowId: 789,
  agentId: 123,
  description: 'Process the data',
  body: 'Detailed instructions for the agent',
  input: 'Optional input data',
  dependencies: [otherTaskId]
})

// Get a task
const task = await client.tasks.get({ workflowId: 789, id: 1 })

// List tasks
const tasks = await client.tasks.list({ workflowId: 789 })

// Update a task
await client.tasks.update({
  workflowId: 789,
  id: 1,
  description: 'Updated description',
  status: 'in-progress'
})

// Delete a task
await client.tasks.delete({ workflowId: 789, id: 1 })
```

---

## Integrations API

```typescript
// List all integration connections
const connections = await client.integrations.listConnections()

// Create a connection
await client.integrations.connect({
  identifier: 'webhook-trigger',
  props: {}
})

// Get or create (recommended)
const connectionId = await client.integrations.getOrCreateConnection('webhook-trigger')
```

Integration identifiers: `webhook-trigger`, `x402-trigger`, `cron-trigger`, `manual-trigger`

---

## Payments API (x402)

```typescript
// Pay and execute an x402 workflow
const result = await client.payments.payWorkflow({
  triggerUrl: 'https://api.openserv.ai/webhooks/x402/trigger/...',
  input: { prompt: 'Generate a summary' }
})

// Discover x402 services
const services = await client.payments.discoverServices()

// Get trigger preflight info
const preflight = await client.payments.getTriggerPreflight({ token: '...' })
```

---

## Web3 API (Credits Top-up)

```typescript
// Top up credits with USDC
const result = await client.web3.topUp({ amountUsd: 10 })

// Get USDC config
const config = await client.web3.getUsdcTopupConfig()

// Verify transaction manually
await client.web3.verifyUsdcTransaction({
  txHash: '0x...',
  payerAddress: '0x...',
  signature: '0x...'
})
```

---

## Authentication

```typescript
// API Key
const client = new PlatformClient({
  apiKey: process.env.OPENSERV_USER_API_KEY
})

// Wallet (SIWE)
const client = new PlatformClient()
await client.authenticate(process.env.WALLET_PRIVATE_KEY)
```
