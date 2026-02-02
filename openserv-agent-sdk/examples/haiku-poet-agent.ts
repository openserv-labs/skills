/**
 * Haiku Poet Agent Example
 *
 * A paid agent that generates haikus using OpenAI.
 * Just define, provision, and run!
 *
 * Run with: npx tsx haiku-poet-agent.ts
 */
import 'dotenv/config'
import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers } from '@openserv-labs/client'
import { z } from 'zod'
import OpenAI from 'openai'

const openai = new OpenAI()

// 1. Define your agent
const agent = new Agent({
  systemPrompt: 'You are a haiku poet. Generate beautiful haikus when asked.'
})

// 2. Add capabilities
agent.addCapability({
  name: 'generate_haiku',
  description: 'Generate a haiku poem about a given topic',
  schema: z.object({
    topic: z.string().describe('The topic or theme for the haiku')
  }),
  async run({ args, action }) {
    console.log(`Generating haiku about: ${args.topic}`)

    // Log progress if in task context
    if (action?.type === 'do-task' && action.task) {
      await this.addLogToTask({
        workspaceId: action.workspace.id,
        taskId: action.task.id,
        severity: 'info',
        type: 'text',
        body: `Creating haiku about "${args.topic}"...`
      })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a haiku poet. Write a haiku (5-7-5 syllables) about the given topic. Only output the haiku, nothing else.'
        },
        { role: 'user', content: args.topic }
      ]
    })

    const haiku = completion.choices[0]?.message?.content || 'Failed to generate haiku'
    console.log(`Haiku:\n${haiku}`)
    return haiku
  }
})

async function main() {
  // 3. Provision with agent instance binding (v2.1+)
  const result = await provision({
    agent: {
      instance: agent, // Binds credentials directly to agent
      name: 'haiku-poet',
      description: 'A poet that creates beautiful haikus on any topic'
    },
    workflow: {
      name: 'default',
      trigger: triggers.x402({
        name: 'Haiku Poetry Generator',
        description: 'Transform any theme into a beautiful traditional haiku poem',
        price: '0.01',
        input: {
          topic: {
            type: 'string',
            title: 'Inspiration for Your Haiku',
            description: 'Share a theme, emotion, or scene — nature, seasons, love, life moments'
          }
        }
      }),
      task: { description: 'Generate a haiku about the given topic' }
    }
  })

  console.log(`Paywall: ${result.paywallUrl}`)
  console.log(`Price: $0.01 per haiku`)

  // 4. Run the agent - credentials already bound
  await run(agent)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
