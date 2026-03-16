# Multi-Agent Workflows Troubleshooting

Common issues and solutions for multi-agent workflows.

---

## Workflow graph looks like spaghetti

If your workflow diagram shows a web of interconnected edges:

1. **Stop and redesign**: Don't try to fix it by adding more edges
2. **Map out the actual data flow**: Write down what each agent needs as input
3. **Rebuild as stages**:
   - Stage 1: Initial processing (parallel if independent)
   - Stage 2: Tasks that need Stage 1 outputs
   - Stage 3: Final combination/output
4. **Delete unnecessary edges**: If an agent doesn't truly need another's output, remove that edge
5. **Use the declarative sync**: Define edges explicitly rather than letting them accumulate

---

## Workflow creation fails with INVALID_PROJECT_GOAL

The backend validates workflow goals and rejects vague or placeholder-like descriptions.

**Error messages:**

- `"The description is too vague and lacks a clear objective."`
- `"The description seems like a placeholder or technical jargon without a clear objective."`

**Rejected examples:**

- `"Test something"`
- `"Process data"`
- `"Handle requests"`
- Technical jargon without clear business purpose

**Working examples:**

- `"Research topics and produce engaging blog posts"`
- `"Process incoming requests and generate automated responses"`
- `"Analyze customer feedback and create actionable reports"`

Goals should describe a clear business objective, not test names or implementation details.

---

## Tasks not executing in order

- Verify `dependencies` array contains correct task IDs
- Each task should only depend on the previous one (not all previous tasks)

---

## Workflow stuck

- Check all dependencies are satisfied (all `done`)
- Verify workflow is in `running` state
- Check agent endpoints are reachable

---

## Output not flowing between tasks

- Ensure workflow edges connect the tasks correctly
- Verify tasks have proper input/output configuration

---

## Triggers not firing tasks

**Most common cause:** Missing workflow edges.

1. **Check edges exist**: Triggers must be connected to tasks via edges in the workflow graph

```typescript
const workflow = await client.workflows.get({ id })
console.log('Edges:', workflow.edges)
// Should show connections like: trigger-xxx → task-xxx
```

If edges are missing, tasks will never execute even if dependencies are set correctly.

2. **Verify trigger is activated**: `await client.triggers.activate({ workflowId, id: triggerId })`

3. **Check workflow is running**: `await workflow.setRunning()`

---

## "Assignee agent not found in workspace"

This error means a task references an agent that isn't a member of the workspace.

**With `workflows.create()`:** This should not happen -- `agentIds` are automatically derived from `tasks[].agentId`. Every agent referenced in a task is included in the workspace. You don't need to specify `agentIds` manually.

```typescript
// This just works -- agents 123 and 456 are auto-included
const workflow = await client.workflows.create({
  name: 'Hyper Agent Relay',
  goal: 'Route incoming requests through a multi-step agent pipeline for processing and response generation',
  triggers: [triggers.webhook({ name: 'api' })],
  tasks: [
    { name: 'step-1', agentId: 123, description: 'First step' },
    { name: 'step-2', agentId: 456, description: 'Second step' }
  ],
  edges: [
    { from: 'trigger:api', to: 'task:step-1' },
    { from: 'task:step-1', to: 'task:step-2' }
  ]
})
```

**With `workflow.sync()`:** `sync()` automatically adds any agents referenced in tasks that aren't already in the workspace. If you sync a task assigned to a new agent, that agent is added to the workspace before the sync happens. You can also add agents explicitly:

```typescript
await workflow.addAgent(789)  // Add agent 789 to the workspace
// or
await client.workflows.addAgent({ id: workflowId, agentId: 789 })
```

**With `provision()`:** Agents are derived from `tasks[].agentId` at creation time, and on re-provision, `sync()` automatically adds any new agents. This is fully idempotent -- you can re-provision with additional agents without recreating the workspace.

---

## "Workspace payout wallet address not found" (x402 triggers)

The x402 trigger needs an `x402WalletAddress` in its props to know where to send payments.

**If using `provision()`:** This is handled automatically via `client.resolveWalletAddress()`.

**If using `workflows.create()` or `workflow.sync()` directly:** Ensure the client was authenticated with a wallet (`client.authenticate(privateKey)`) or that `WALLET_PRIVATE_KEY` is in the environment. The wallet address is auto-injected for x402 triggers. You can also set it explicitly per-trigger:

```typescript
triggers: [
  triggers.x402({ price: '0.01', walletAddress: '0x...explicit-payout-address' })
]
```

---

## Integration connection errors

The `workflows.sync()` and `workflows.create()` methods automatically handle integration connection IDs when you provide a trigger `type`. If you're creating triggers manually using the triggers API directly, you need to resolve connection IDs first:

```typescript
// Always resolve to actual connection ID first
const connId = await client.integrations.getOrCreateConnection('webhook-trigger')

await client.triggers.create({
  workflowId,
  name: 'My Trigger',
  integrationConnectionId: connId, // UUID required
  props: { ... }
})
```

---

## Edges are the only execution mechanism (dependencies field is ignored)

**Problem:** Tasks have `dependencies` set correctly but don't execute in order, or don't execute at all.

**Cause:** The `dependencies` array on tasks is not used by the platform's task scheduler. Only the `edges` array controls execution order.

**Solution:** Always define explicit edges. Every task must be reachable from a trigger via edges:

```typescript
// WRONG: dependencies alone do nothing
tasks: [
  { name: 'step1', agentId: 1, description: '...' },
  { name: 'step2', agentId: 2, description: '...', dependencies: ['step1'] }
]

// RIGHT: edges control execution
tasks: [
  { name: 'step1', agentId: 1, description: '...' },
  { name: 'step2', agentId: 2, description: '...' }
],
edges: [
  { from: 'trigger:myTrigger', to: 'task:step1' },
  { from: 'task:step1', to: 'task:step2' }
]
```

---

## Fan-in edges trigger tasks too early (OR semantics, not AND)

**Problem:** A task with multiple incoming edges (e.g., intelligence→compile + research→compile) starts when the *first* predecessor finishes, not when *all* finish. The task may run with incomplete data.

**Cause:** Each incoming edge is an independent trigger. When task A completes and fires the A→C edge, C starts immediately — the platform does not wait for B→C.

**Example — task starts before all data is ready:**

```typescript
// WRONG: compile starts when EITHER intelligence or research finishes
edges: [
  { from: 'task:resolve', to: 'task:intelligence' },
  { from: 'task:resolve', to: 'task:research' },
  { from: 'task:intelligence', to: 'task:compile' },
  { from: 'task:research', to: 'task:compile' },  // two incoming edges = OR
]
```

**Solution:** Use only ONE incoming edge from the slowest predecessor. The final task's platform model fetches other tasks' output via `get-task-detail` — no direct edge is needed for data access.

```typescript
// RIGHT: compile only starts after research (the slower task)
edges: [
  { from: 'trigger:api', to: 'task:resolve' },
  { from: 'task:resolve', to: 'task:intelligence' },  // parallel
  { from: 'task:resolve', to: 'task:research' },       // parallel
  { from: 'task:research', to: 'task:compile' },        // ONE incoming edge
  // compile fetches intelligence data via get-task-detail, no edge needed
]
```

**Key rule:** Fan-OUT is AND (all outgoing edges fire). Fan-IN is OR (any incoming edge triggers). Design topologies around this asymmetry.

---

## Edges control timing, not data flow

**Problem:** You assume an edge A→B passes A's output as B's input. It doesn't.

**Cause:** An edge means "start B after A finishes." B's platform model independently discovers A's output by querying workspace tasks via `get-task-detail`. A task can fetch data from ANY other task in the workflow, even without a direct edge.

**Implication:** Use edges for ordering only. Write task descriptions that explicitly name which tasks to fetch data from:

> "Call compile_signal. Use the output from the resolve task and the intelligence task. Return ONLY the raw JSON output."

---

## `workflows.sync()` creates tasks that never execute

**Problem:** After calling `workflows.sync()` with tasks, edges, and triggers, tasks stay "to-do" forever when triggers fire. No error — just silence.

**Cause:** `sync()` updates the workflow definition (tasks, edges, agent assignments) but does not wire the internal dispatch that connects trigger events to task execution.

**Solution:** Use `workflows.create()` for initial workflow setup. It properly wires trigger-to-task dispatch. Accept that each `workflows.create()` call produces a new workflow ID and new trigger tokens.

```typescript
// Use create() — not sync() — for workflows with triggers
const workflow = await client.workflows.create({
  name: 'My Pipeline',
  goal: '...',
  triggers: [triggers.webhook({ name: 'api' })],
  tasks: [
    { name: 'step1', agentId: agent1, description: '...' },
    { name: 'step2', agentId: agent2, description: '...' }
  ],
  edges: [
    { from: 'trigger:api', to: 'task:step1' },
    { from: 'task:step1', to: 'task:step2' }
  ]
})
```

---

## Platform model runs tasks with incomplete data

**Problem:** A task starts and calls the agent's capability before all predecessor tasks have finished. The agent receives empty or partial data.

**Cause:** The platform model on each task is an LLM making judgment calls, not a deterministic scheduler. If it sees some inputs available, it may decide "good enough" and proceed.

**Solution:** Correct edge topology (see fan-in section above) prevents this by not starting the task until the prerequisite finishes. Additionally, add explicit instructions to the task body:

> "You MUST have output from both the resolve task and the intelligence task before calling the capability. If either is missing, wait."

---

## Platform model creates files and uses tools autonomously

**Problem:** Unexpected files appear in the workspace (e.g., `research_output.md`, todo list entries). Tasks take longer than expected.

**Cause:** The platform's orchestration model on each task has access to workspace tools (file creation, todo lists) and uses them without being asked. Each autonomous tool call adds latency.

**Solution:** Add to task descriptions:

> "Do NOT create any files. Do NOT use todo lists. Return ONLY the raw JSON output from the capability — nothing else."

---

## Output reviewer rejects task output (slow retries)

**Problem:** Tasks take 30-60s longer than expected. Agent capabilities execute quickly but the task stays in-progress.

**Cause:** After your agent returns output, a reviewer LLM scores it 1-10. Scores below ~5 trigger a rejection and retry. Each rejection adds 30-60s. The reviewer checks whether the output "fulfills" the task description.

**Common rejection triggers:**

- Task body describes intermediate steps (e.g., "extract field A, then pass to capability B") but the output only shows the final JSON
- Inconsistencies (e.g., output says "based on 4 sources" but lists 3)
- Output doesn't visually match what the task description implies

**Solution:** Write simple, imperative task descriptions focused on the output:

```
// WRONG (reviewer wants to see extraction evidence):
"From the resolved market JSON, extract token_ids.yes as token_id and
question as market_question. Call analyze_smart_money with these parameters.
Return the full JSON output."

// RIGHT (reviewer just checks for JSON):
"Call analyze_smart_money. Use token_id from the resolve task output.
Return ONLY the raw JSON output from the capability — nothing else."
```

---

## Stale routing after agent redeployment

**Problem:** After redeploying an agent to a new container, existing workflows fail to reach it. Tasks error even though the container is healthy (returns 401 on direct HTTP check).

**Cause:** The platform routes through `agents-proxy.openserv.ai` with an internal routing table. After redeployment to a new container, there may be a propagation delay or stale routing entry.

**Solution:** After redeploying an agent, create a new workflow to force a fresh routing lookup:

```bash
# 1. Redeploy the agent
npx @openserv-labs/client deploy .

# 2. Run setup script to create new workflow
npx tsx scripts/setup-workflow.ts

# 3. Test with new workflow's trigger tokens
npx tsx scripts/test.ts
```

Don't reuse old workflow IDs with newly deployed agents unless you've verified tasks execute correctly.

---

## No safe way to update a live workflow

**Problem:** You cannot edit a running workflow's tasks, edges, or agent bindings without breaking it. Every code change to any agent requires creating an entirely new workflow, which generates new webhook tokens and paywall URLs.

**Cause:** Two platform behaviors combine to make this unavoidable:

1. `workflows.sync()` creates task templates that never execute (see "workflows.sync() creates tasks that never execute" above)
2. Agent-to-container routing is snapshotted at workflow creation time. Redeploying an agent to a new container (which happens on every code push or container restart) leaves the old workflow pointing at the dead container URL.

**What happens when you try to update:**

```typescript
// You deploy a code fix to an agent
// Container changes: eq590vno085x → gba8n3u2pt6q

// WRONG: Update existing workflow
await client.workflows.sync({
  id: existingWorkflowId,
  tasks: updatedTasks,
  edges: updatedEdges,
  triggers: sameTriggers,
})
// Result: webhook fires → tasks stay "to-do" → never execute → timeout

// WRONG: Keep old workflow, hope routing updates
// Result: "API could not reach the agent" (points at dead container)

// RIGHT: Create new workflow
const workflow = await client.workflows.create({
  name: 'My Service',
  goal: '...',
  tasks: updatedTasks,
  edges: updatedEdges,
  triggers: newTriggers,
})
// Result: new workflow ID, new webhook token, new paywall URL — but works
```

**Impact:** Every iteration of your agent code produces a new workflow ID, webhook URL, and paywall URL. If customers were using the old paywall link, it breaks. There is no stable public endpoint that survives redeployment.

**Workaround:** Put a reverse proxy, DNS redirect, or URL shortener in front of your paywall/webhook URLs. After each deploy, update the redirect target to the new URL. Customers always hit the stable proxy URL.

**Rule:** Accept that `workflows.create()` is the only safe deployment method. Build deployment scripts to output new URLs and update external references automatically.

---

## UI diagram shows phantom edges

**Problem:** The workflow diagram in the platform UI shows visual connections between tasks that don't exist in the actual edge data. For example, a line appears from `research → compiler` even though the `edges` array only contains `intelligence → compiler`.

**Cause:** The UI appears to infer data flow relationships (e.g., when a task reads another task's output via `get-task-detail`) and renders them as edges, indistinguishable from real edges.

**Impact:** This is especially dangerous given fan-in OR semantics. Builders see the diagram and think they have fan-in edges when they don't, or think topology is correct when edges are missing.

**Solution:** Don't trust the UI diagram for edge verification. Query the API directly:

```typescript
const wf = await client.workflows.get({ id: workflowId })
console.log('Edge count:', wf.edges.length)
for (const e of wf.edges) {
  console.log(`  ${e.source} → ${e.target}`)
}
```

Add this check to your test script.
