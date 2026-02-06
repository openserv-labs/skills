/**
 * Agent Example
 *
 * A simple agent using the SDK and Client packages.
 * Just provision() + run() - that's all you need!
 *
 * Run with: npx tsx agent.ts
 */
import 'dotenv/config'
import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers } from '@openserv-labs/client'
import { z } from 'zod'
import OpenAI from 'openai'

const openai = new OpenAI()

const agent = new Agent({
  systemPrompt: 'You are a helpful assistant.'
})

agent.addCapability({
  name: 'processRequest',
  description: 'Process user requests',
  schema: z.object({
    input: z.string().describe('The request to process')
  }),
  async run({ args }) {
    console.log(`Processing: ${args.input}`)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: args.input }]
    })

    return response.choices[0]?.message?.content || 'No response'
  }
})

async function main() {
  // Just call provision() - it's IDEMPOTENT!
  // Creates on first run, updates on subsequent runs
  // No need to check isProvisioned() first
  const result = await provision({
    agent: {
      instance: agent, // Binds credentials directly to agent (v1.1+)
      name: 'example-agent',
      description: 'An example assistant agent'
    },
    workflow: {
      name: 'default',
      trigger: triggers.webhook({
        waitForCompletion: true,
        input: { input: { type: 'string', title: 'Your Request' } }
      }),
      task: { description: 'Process the user request' }
    }
  })

  console.log(`Webhook: https://api.openserv.ai/webhooks/trigger/${result.triggerToken}`)

  // Start the agent - credentials already bound
  await run(agent)
}

main().catch(console.error)
