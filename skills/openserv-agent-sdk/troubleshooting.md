# OpenServ SDK Troubleshooting

Common issues and solutions.

---

## "OpenServ API key is required"

**Error:** `Error: OpenServ API key is required. Please provide it in options, set OPENSERV_API_KEY environment variable, or call provision() first.`

**Cause:** The agent was started without credentials being set up.

**Solution:** Pass the agent instance to `provision()` for automatic credential binding:

```typescript
const agent = new Agent({ systemPrompt: '...' })
agent.addCapability({ ... })

await provision({
  agent: {
    instance: agent,  // Binds credentials directly to agent (v2.1+)
    name: 'my-agent',
    description: '...'
  },
  workflow: { ... }
})
await run(agent)  // Credentials already bound
```

The `provision()` function creates the wallet, API key, and auth token on first run. When you pass `agent.instance`, it calls `agent.setCredentials()` automatically, so you don't need to rely on environment variables.

---

## Port already in use (EADDRINUSE)

```bash
lsof -ti:7378 | xargs kill -9
```

Or set a different port in `.env`: `PORT=7379`

---

## "OPENSERV_AUTH_TOKEN is not set" warning

This is a security warning. The `provision()` function auto-generates this token. If missing, re-run provision or manually generate:

```typescript
const { authToken, authTokenHash } = await client.agents.generateAuthToken()
await client.agents.saveAuthToken({ id: agentId, authTokenHash })
// Save authToken to .env as OPENSERV_AUTH_TOKEN
```

---

## Trigger not firing

1. Check workflow is running: `await client.workflows.setRunning({ id: workflowId })`
2. Check trigger is active: `await client.triggers.activate({ workflowId, id: triggerId })`
3. Verify the trigger is connected to the task in the workflow graph

---

## Tunnel connection issues

The `run()` function connects via WebSocket to `agents-proxy.openserv.ai`. If connection fails:

1. Check internet connectivity
2. Verify no firewall blocking WebSocket connections
3. The agent retries with exponential backoff (up to 10 retries)

For production, set `DISABLE_TUNNEL=true` and use `run(agent)` — it will start only the HTTP server without the WebSocket tunnel. The platform reaches your agent directly at its public `endpointUrl`.

To force tunnel mode even when `endpointUrl` is configured, set `FORCE_TUNNEL=true`.

---

## OpenAI API errors (process() only)

`OPENAI_API_KEY` is only needed if you use the `process()` method for direct OpenAI calls. Most agents don't need it—use **runless capabilities** or `generate()` instead, which delegate LLM calls to the platform (no API key required).

If you do use `process()`:

- Verify `OPENAI_API_KEY` is set correctly
- Check API key has credits/billing enabled
- SDK requires `openai@^5.x` as a peer dependency

---

## ERC-8004 registration fails with "insufficient funds"

**Error:** `ContractFunctionExecutionError: insufficient funds for transfer`

**Cause:** The wallet created by `provision()` has no ETH on Base mainnet to pay gas.

**Solution:** Fund the wallet address logged during provisioning (`Created new wallet: 0x...`) with a small amount of ETH on Base. Always wrap `registerOnChain` in a try/catch so the agent can still start via `run(agent)`.

---

## ERC-8004 registration fails with 401 Unauthorized

**Error:** `AxiosError: Request failed with status code 401` during `client.authenticate()`

**Cause:** `WALLET_PRIVATE_KEY` is empty. `provision()` writes it to `.env` at runtime, but `process.env` already loaded the empty value at startup.

**Solution:** Use `dotenv` programmatically and reload after `provision()`:

```typescript
import dotenv from 'dotenv'
dotenv.config()

// ... provision() ...

dotenv.config({ override: true }) // reload to pick up WALLET_PRIVATE_KEY
```

Do **not** use `import 'dotenv/config'` — it only loads `.env` once at import time and cannot be reloaded.

---

## 401 Unauthorized when using PlatformClient for debugging

**Error:** `AxiosError: Request failed with status code 401` when calling `client.tasks.list()` or other `PlatformClient` methods.

**Cause:** You are using the **agent** API key (`OPENSERV_API_KEY`) instead of the **user** API key. These are different:

- **`OPENSERV_API_KEY`** — The agent's API key, set by `provision()`. Used internally by the agent to authenticate with the platform when receiving tasks. **Cannot** be used with `PlatformClient` for management calls.
- **`OPENSERV_USER_API_KEY`** — Your user/account API key. Required for `PlatformClient` calls like listing tasks, managing workflows, etc.

**Solution:** Authenticate `PlatformClient` using your wallet (recommended) or your user API key:

```typescript
// Option 1: Wallet authentication (recommended — uses the wallet from provision)
const client = new PlatformClient()
await client.authenticate(process.env.WALLET_PRIVATE_KEY)

// Option 2: User API key (from platform dashboard, NOT the agent key)
const client = new PlatformClient({
  apiKey: process.env.OPENSERV_USER_API_KEY // NOT OPENSERV_API_KEY
})
```

**Tip:** After `provision()` runs, the `WALLET_PRIVATE_KEY` is stored in `.env`. Use `dotenv.config({ override: true })` to reload it if needed (see the ERC-8004 401 section above).

---

## ESM / CommonJS import errors

**Error:** `SyntaxError: Named export 'Agent' not found` or `ERR_REQUIRE_ESM` or similar module resolution errors.

**Cause:** Mismatch between your project's module system and how you import the packages.

**Solution:** The recommended setup is ESM (`"type": "module"` in `package.json`) with `tsx` as the runtime:

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/agent.ts"
  }
}
```

```bash
npm i -D tsx typescript @types/node
```

Use standard ESM imports:

```typescript
import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers } from '@openserv-labs/client'
```

**If you must use CommonJS** (no `"type": "module"`), use dynamic `import()`:

```typescript
async function main() {
  const { Agent, run } = await import('@openserv-labs/sdk')
  const { provision, triggers } = await import('@openserv-labs/client')
  // ... rest of your code
}
main()
```

**Do not** mix `require()` with ESM-only packages. If you see `ERR_REQUIRE_ESM`, switch to `"type": "module"` or use dynamic imports.

---

## `generate()` with `outputSchema` fails silently

**Problem:** Calling `generate()` with the `outputSchema` parameter causes timeouts, empty responses, or 502 errors.

**Cause:** The platform's internal LLM routing doesn't reliably support structured output mode. The schema constraint causes the underlying model call to hang or fail.

**Solution:** Prompt for plain-text JSON and parse with regex:

```typescript
// WRONG: outputSchema causes failures
const result = await this.generate({
  prompt: 'Analyze this...',
  outputSchema: z.object({ sentiment: z.string() }),
  action,
})

// RIGHT: prompt for JSON text, parse manually
const generated = await this.generate({
  prompt: `Analyze this data. Respond with ONLY a JSON object.
No markdown, no backticks, no explanation.
Schema: {"sentiment": "BULLISH or BEARISH", "confidence": 0-100}

Data: ${JSON.stringify(data)}`,
  action,
})

let result = { sentiment: 'UNKNOWN', confidence: 0 } // fallback
if (generated) {
  const match = generated.match(/\{[\s\S]*\}/)
  if (match) {
    try { result = JSON.parse(match[0]) } catch {}
  }
}
```

**Rule:** Never use `outputSchema`. Always prompt for plain text JSON and parse with `match(/\{[\s\S]*\}/)`.

---

## Action type crash in capability `run()`

**Problem:** Accessing `action.task` in a capability's `run()` function crashes with "Cannot read properties of undefined."

**Cause:** The `action` parameter can be different types (`do-task`, `respond-chat-message`, etc.). Only `do-task` actions have a `.task` property.

**Solution:** Always type-guard before accessing task properties:

```typescript
agent.addCapability({
  name: 'my_capability',
  schema: z.object({ ... }),
  async run({ args, action }) {
    // WRONG: may crash
    // await this.addLogToTask({ taskId: action.task.id, ... })

    // RIGHT: type guard first
    if (action?.type === 'do-task' && action.task) {
      await this.addLogToTask({
        workspaceId: action.workspace.id,
        taskId: action.task.id,
        severity: 'info',
        type: 'text',
        body: 'Starting...'
      })
    }

    // ... capability logic ...
    return JSON.stringify(result)
  }
})
```

---

## Don't use `process()`, `doTask()`, or `completeTask()`

**Problem:** Calling `this.process()`, `this.doTask()`, or `this.completeTask()` results in errors or unexpected behavior.

**Cause:** The platform manages the task lifecycle. When your capability's `run()` function returns a value, the platform automatically calls `complete_task` with that output. Calling these methods manually conflicts with the platform's state machine.

**Solution:** Just return your result from `run()`:

```typescript
async run({ args, action }) {
  const data = await fetchSomeData(args)
  const result = processData(data)
  return JSON.stringify(result) // Platform handles task completion
}
```

---

## Model choice affects platform behavior, not just speed

**Problem:** Changing `model_parameters.model` on an agent causes unexpected platform behavior — output rewriting, timeouts, or 502 errors — even though the agent code is unchanged.

**Cause:** The platform's orchestration LLM (which sits between triggers and your capability) changes behavior based on which model is assigned to the agent:

| Agent model | Observed behavior |
|---|---|
| `claude-opus-4-6` | Platform passes output through correctly (~153s) |
| `claude-sonnet-4-6` | Platform model rewrites the entire output (~295s) |
| `gpt-5-mini` | Container returns 502, platform synthesizes output manually (~534s) |
| `gpt-5` | Works well for data-fetching tasks, reasonable speed |

**Solution:** Test each model choice end-to-end. Don't assume a model change only affects speed or cost — it changes the platform orchestration model's behavior as well. Start with `gpt-5` for simple data tasks and `claude-opus-4-6` for complex synthesis.

---

## Platform model rewrites or strips output fields

**Problem:** Your agent returns complete JSON, but the stored task output is missing fields, has fields rewritten, or contains added narrative text.

**Cause:** The platform's orchestration LLM processes each task's output before storing it. It may restructure, summarize, or strip fields it considers irrelevant.

**Solution:**

1. Keep your most important data in top-level fields with obvious names (`tldr`, `signal`, `score`) that the platform model recognizes as "the answer"
2. Use the task body template that minimizes platform intervention:

```
Call [capability_name] with [parameters].
Return ONLY the raw JSON output from the capability — nothing else.
Do NOT create any files. Do NOT use todo lists.
```

3. If the platform consistently strips a specific field, rename it or move it into a top-level summary field

---

## Platform wraps capability output for downstream tasks

**Problem:** A downstream task receives data wrapped in `{"inputs":{...}, "output":"..."}` or `{"result":"..."}` instead of the raw JSON your agent returned.

**Cause:** The platform's orchestration LLM processes each task's output before passing it to downstream tasks. It may restructure or wrap the data.

**Solution:** Use a robust `extractPayload` helper in every downstream agent:

```typescript
function extractPayload<T>(raw: string, hasKey: string): T {
  let parsed: any
  try { parsed = JSON.parse(raw) } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) parsed = JSON.parse(raw.slice(start, end + 1))
    else throw new Error(`Cannot parse: ${raw.slice(0, 200)}`)
  }
  if (parsed && typeof parsed === 'object' && hasKey in parsed) return parsed as T
  for (const field of ['output', 'result', 'data']) {
    if (parsed?.[field]) {
      const inner = typeof parsed[field] === 'string'
        ? JSON.parse(parsed[field])
        : parsed[field]
      if (inner && hasKey in inner) return inner as T
    }
  }
  return parsed as T
}

// Usage:
const market = extractPayload<ResolvedMarket>(args.market_data, 'token_ids')
```
