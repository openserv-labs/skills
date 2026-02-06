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

For production, use `agent.start()` with `endpointUrl` instead of the tunnel.

---

## OpenAI API errors

- Verify `OPENAI_API_KEY` is set correctly
- Check API key has credits/billing enabled
- SDK requires `openai@^5.x` as a peer dependency
