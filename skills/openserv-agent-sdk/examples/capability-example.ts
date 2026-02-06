/**
 * Capability Example
 *
 * Demonstrates how to create and structure agent capabilities.
 */
import { Agent } from '@openserv-labs/sdk'
import { z } from 'zod'
import OpenAI from 'openai'

const openai = new OpenAI()

const agent = new Agent({
  systemPrompt: 'You are a text analysis assistant.'
})

// Single capability with schema validation
agent.addCapability({
  name: 'analyzeText',
  description: 'Analyze text for sentiment and key themes',
  schema: z.object({
    text: z.string().describe('The text to analyze'),
    depth: z.enum(['quick', 'detailed']).optional().describe('Analysis depth')
  }),
  async run({ args }) {
    const { text, depth = 'quick' } = args
    console.log(`Analyzing text (${depth} mode): "${text.slice(0, 50)}..."`)

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Analyze the following text. Provide ${
            depth === 'detailed' ? 'comprehensive' : 'brief'
          } analysis of sentiment and key themes.`
        },
        { role: 'user', content: text }
      ]
    })

    return response.choices[0]?.message?.content || 'Analysis failed'
  }
})

export { agent }
