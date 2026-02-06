/**
 * Multiple Capabilities Example
 *
 * Demonstrates adding multiple capabilities at once.
 */
import { Agent } from '@openserv-labs/sdk'
import { z } from 'zod'
import OpenAI from 'openai'

const openai = new OpenAI()

const agent = new Agent({
  systemPrompt: 'You are a versatile text processing assistant.'
})

// Add multiple capabilities at once
agent.addCapabilities([
  {
    name: 'summarize',
    description: 'Summarize text content',
    schema: z.object({
      text: z.string().describe('Text to summarize'),
      maxLength: z.number().optional().describe('Max words in summary')
    }),
    async run({ args }) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Summarize in ${args.maxLength || 100} words or less.` },
          { role: 'user', content: args.text }
        ]
      })
      return response.choices[0]?.message?.content || ''
    }
  },
  {
    name: 'translate',
    description: 'Translate text to another language',
    schema: z.object({
      text: z.string().describe('Text to translate'),
      targetLanguage: z.string().describe('Target language')
    }),
    async run({ args }) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Translate to ${args.targetLanguage}. Output only the translation.`
          },
          { role: 'user', content: args.text }
        ]
      })
      return response.choices[0]?.message?.content || ''
    }
  },
  {
    name: 'extractKeywords',
    description: 'Extract keywords from text',
    schema: z.object({
      text: z.string().describe('Text to extract keywords from'),
      count: z.number().optional().describe('Number of keywords')
    }),
    async run({ args }) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Extract ${args.count || 5} keywords. Output as comma-separated list.`
          },
          { role: 'user', content: args.text }
        ]
      })
      return response.choices[0]?.message?.content || ''
    }
  }
])

export { agent }
