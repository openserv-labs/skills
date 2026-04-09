# OpenServ Client Troubleshooting

Common issues and solutions.

---

## Task stuck in "to-do"

1. Check workflow is running: `await client.workflows.setRunning({ id })`
2. Check trigger is activated: `await client.triggers.activate({ workflowId, id })`
3. Verify trigger-to-task edge exists in workflow graph

---

## Triggers not created via sync

The sync endpoint requires actual **integration connection IDs** (UUIDs), not just integration identifiers. The `workflows.sync()` method handles this automatically by:

1. Resolving the trigger `type` (e.g., `'webhook'`) to an integration identifier (e.g., `'webhook-trigger'`)
2. Calling `client.integrations.getOrCreateConnection()` to get the actual UUID
3. Using that UUID in the sync payload

If building triggers manually, always use `getOrCreateConnection()`:

```typescript
const connectionId = await client.integrations.getOrCreateConnection('webhook-trigger')

await client.triggers.create({
  workflowId,
  name: 'My Trigger',
  integrationConnectionId: connectionId, // UUID required
  props: { ... }
})
```

---

## Adding agents to an existing workspace

When you `sync()` or re-provision a workflow with tasks assigned to agents not yet in the workspace, the client library automatically adds them. You can also add agents explicitly:

```typescript
// Automatic: sync() adds missing agents before syncing
await workflow.sync({
  tasks: [
    { name: 'task1', agentId: existingAgent, description: '...' },
    { name: 'task2', agentId: newAgent, description: '...' }  // added automatically
  ]
})

// Explicit: add an agent without assigning a task
await workflow.addAgent(456)
// or
await client.workflows.addAgent({ id: workflowId, agentId: 456 })
```

---

## Edges not created

Edges link triggers to tasks in the workflow graph. They can be:

1. **Auto-generated**: When you call `sync()` with triggers and tasks but no edges, each trigger connects to the first task
2. **Explicit**: Provide the `edges` array to define custom connections
3. **Created via provision()**: The `provision()` function automatically creates nodes and edges

To verify edges exist:

```typescript
const workflow = await client.workflows.get({ id })
console.log('Edges:', workflow.edges)
// Should show: [{ id, source: 'trigger-...', target: 'task-...', ... }]
```

---

## Paywall shows wrong fields

Ensure `input` schema is defined in trigger config:

```typescript
triggers.x402({
  price: '0.01',
  input: {
    myField: { type: 'string', title: 'My Label' }
  }
})
```

---

## Authentication errors

- Verify `WALLET_PRIVATE_KEY` or `OPENSERV_USER_API_KEY` is set
- For wallet auth, ensure key starts with `0x`
- If `WALLET_PRIVATE_KEY` is empty after `provision()`, reload `.env` with `dotenv.config({ override: true })` — see below

---

## ERC-8004: "insufficient funds for transfer"

The wallet has no ETH on Base mainnet for gas. Fund the wallet address (logged during provisioning) with a small amount of ETH on Base. Always wrap `registerOnChain` in try/catch so the agent can still start.

---

## ERC-8004: 401 on first run

`WALLET_PRIVATE_KEY` is empty because `provision()` writes it to `.env` after the initial `dotenv` load. Use `dotenv` programmatically and reload after provision:

```typescript
import dotenv from 'dotenv'
dotenv.config()
// ... provision() ...
dotenv.config({ override: true })
```

---

## `provision()` creates new workflows silently

**Problem:** After changing your workflow definition (tasks, edges, triggers) and re-running `provision()`, your old workflow still exists and a new one was created. You end up with multiple orphaned workflows.

**Cause:** `provision()` is idempotent for agent registration (same `agentId` is reused) but creates a NEW workflow every time if the workflow definition changes. It does not update existing workflows in-place.

**Implication:** For multi-agent workflows with custom edge topologies, use `provision()` only for agent registration. Use `workflows.create()` in a separate setup script for workflow creation, accepting that each iteration produces a new workflow ID and trigger tokens.

```typescript
// Agent registration (idempotent, reuses agentId):
const result = await provision({
  agent: { instance: agent, name: 'my-agent', description: '...' },
  workflow: { ... }
})

// For multi-agent workflows, use a separate setup script:
const workflow = await client.workflows.create({
  name: 'My Pipeline',
  goal: '...',
  triggers: [...],
  tasks: [...],
  edges: [...]
})
```

---

## `model_parameters` returns 400 with no useful error

**Problem:** Setting `model_parameters` in `provision()` returns a 400 error without indicating which field is wrong.

**Cause:** All three fields are required: `model`, `verbosity`, and `reasoning_effort`. Missing any one of them causes a 400, but the error message doesn't specify which field is missing.

**Solution:** Always provide all three:

```typescript
await provision({
  agent: {
    instance: agent,
    name: 'my-agent',
    description: '...',
    model_parameters: {
      model: 'gpt-5',              // required
      verbosity: 'medium',          // required: 'low' | 'medium' | 'high'
      reasoning_effort: 'medium',   // required: 'low' | 'medium' | 'high'
    }
  },
  workflow: { ... }
})
```

Use `client.models.list()` to discover available model identifiers before hardcoding.

---

## `model_parameters` can't be updated via `agents.update()`

**Problem:** Calling `client.agents.update()` with `model_parameters` returns 400.

**Cause:** The agent update endpoint doesn't accept `model_parameters`. They can only be set during `provision()`.

**Solution:** To change an agent's model, re-run `provision()` with the new `model_parameters`. The agent ID is preserved (idempotent), but a new workflow will be created.

---

## Deploy says "OPENSERV_USER_API_KEY is required" but you don't have one

**Problem:** Running `npx @openserv-labs/client deploy .` fails because `OPENSERV_USER_API_KEY` is not set. You don't have this key and don't know where to get it.

**Cause:** The key is auto-generated by `provision()` and stored in `.openserv.json` in the agent directory. It is NOT something you get from a dashboard or create manually. You must run `provision()` first (via `npm run dev`), then extract the key.

**Solution:** The full deploy flow per agent:

```bash
# Step 1: Provision (creates .openserv.json with the key)
npm run dev
# Wait for "Connected" message, then Ctrl-C

# Step 2: Extract the key from .openserv.json into .env
node -e "const j=JSON.parse(require('fs').readFileSync('.openserv.json','utf8')); console.log('OPENSERV_USER_API_KEY='+j.apiKey)" >> .env

# Step 3: Deploy
npx @openserv-labs/client deploy .
```

This is the intended flow. `provision()` creates the wallet, registers the agent, and writes credentials to `.openserv.json`. The deploy CLI reads `OPENSERV_USER_API_KEY` from `.env`. The extraction step bridges the two.

---

## Deploy fails with 500 on file upload

**Problem:** `npx @openserv-labs/client deploy .` fails with a 500 error during file upload.

**Cause:** `package-lock.json` in the deploy directory causes the platform's upload handler to fail.

**Solution:** Add `package-lock.json` to `.gitignore` and ensure it's not in the deploy directory:

```
# .gitignore
node_modules/
package-lock.json
.openserv.json
.env
```

---

## Deploy fails with stale container

**Problem:** Deploy fails with 500/502 errors even after code changes. Or the deployed agent doesn't reflect your latest code.

**Cause:** The `OPENSERV_CONTAINER_ID` in `.env` points to a dead or stale container. Containers on the platform can go "stopped" randomly.

**Solution:** Delete the container ID and redeploy:

```bash
# Remove stale container reference
sed -i '' '/OPENSERV_CONTAINER_ID/d' .env

# Redeploy (creates fresh container)
npx @openserv-labs/client deploy .
```

Expect this to happen regularly. Containers have lifecycle limits and can be reaped when idle.

---

## Undeclared peer dependencies cause container build failures

**Problem:** Deploy succeeds but the agent fails at runtime with module-not-found errors in the container.

**Cause:** Some packages have undeclared peer dependencies that aren't installed automatically:

- `@openserv-labs/sdk` requires `openai` (not declared)
- `@dome-api/sdk` requires `@privy-io/server-auth` (not declared)

**Solution:** Install peer deps explicitly and add `.npmrc` for legacy resolution:

```bash
npm install @privy-io/server-auth openai --legacy-peer-deps
```

```
# .npmrc (in agent directory)
legacy-peer-deps=true
```

---

## `.env` variable concatenation after `provision()`

**Problem:** After `provision()` runs, environment variables in `.env` are malformed. E.g., `DOME_API_KEY=abcWALLET_PRIVATE_KEY=0x...`

**Cause:** If the `.env` file doesn't end with a newline, `provision()` appends new variables that concatenate with the last line.

**Solution:** Ensure `.env` files always end with a trailing newline. When creating `.env` programmatically:

```bash
# Always add trailing newline
echo "DOME_API_KEY=abc" > .env
echo "" >> .env  # trailing newline
```

---

## x402 paywall returns stale results

**Problem:** After fixing a bug and redeploying, the x402 paywall endpoint returns output from a previous run instead of triggering a new execution.

**Cause:** Platform-side caching on the paywall endpoint.

**Solution:** Use the free webhook trigger for testing instead of the x402 paywall:

```typescript
// Fire the free webhook (no payment, no caching)
const result = await client.triggers.fireWebhook({
  workflowId,
  triggerName: 'test',  // the free webhook trigger
  input: { url: 'https://...' }
})
```

Always create a free webhook trigger alongside the x402 trigger during setup.

---

## Trigger input values are always strings

**Problem:** Your capability receives `"10"` (string) instead of `10` (number) for a trigger input field, even though the paywall UI showed a numeric dropdown.

**Cause:** All trigger input values are passed as strings regardless of how they're defined in the input schema.

**Solution:** Cast inside your capability code:

```typescript
async run({ args }) {
  const topN = parseInt(String(args.topN || '10'), 10)
  const minSpread = parseFloat(String(args.minSpread || '0.04'))
  // ...
}
```

---

## Paywall/webhook URLs break on every redeployment

**Problem:** Every code change to any agent requires creating a new workflow via `workflows.create()`, which generates new webhook tokens and paywall URLs. Old URLs stop working. There is no stable endpoint that survives redeployment.

**Cause:** Two platform behaviors combine:

1. `workflows.sync()` creates dead tasks (never execute)
2. Agent container routing is snapshotted at workflow creation time and goes stale on redeploy

**Workaround:** Place a reverse proxy, DNS redirect, or URL shortener in front of your paywall and webhook URLs. After each deploy, your setup script outputs new URLs; update the redirect target.

```bash
# In setup-workflow.ts, after creating the workflow:
console.log(`New paywall: https://platform.openserv.ai/workspace/paywall/${trigger.token}`)
console.log(`Update your proxy to point to this URL`)
```

**Rule:** Build deployment scripts that output new URLs and update external references automatically. Never give customers a raw platform paywall URL directly.
