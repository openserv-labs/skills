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
