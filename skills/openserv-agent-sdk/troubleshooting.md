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

dotenv.config({ override: true })  // reload to pick up WALLET_PRIVATE_KEY
```

Do **not** use `import 'dotenv/config'` — it only loads `.env` once at import time and cannot be reloaded.
