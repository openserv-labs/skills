/**
 * Integrations Example
 *
 * Demonstrates calling external integrations.
 */
import { Agent } from '@openserv-labs/sdk'
import { z } from 'zod'

const agent = new Agent({
  systemPrompt: 'You are an assistant that can interact with external services.'
})

agent.addCapability({
  name: 'postTweet',
  description: 'Post a tweet using Twitter integration',
  schema: z.object({
    text: z.string().describe('Tweet content')
  }),
  async run({ args, action }) {
    if (action?.type !== 'do-task') return 'No workspace context'

    // Check if Twitter integration is available
    const twitterIntegration = action.integrations?.find(i => i.identifier === 'twitter-v2')

    if (!twitterIntegration) {
      return 'Twitter integration not configured in this workspace'
    }

    // Call the integration
    const response = await this.callIntegration({
      workspaceId: action.workspace.id,
      integrationId: twitterIntegration.id,
      details: {
        endpoint: '/2/tweets',
        method: 'POST',
        data: { text: args.text }
      }
    })

    return `Tweet posted! Response: ${JSON.stringify(response)}`
  }
})

agent.addCapability({
  name: 'listAvailableIntegrations',
  description: 'List all available integrations',
  schema: z.object({}),
  async run({ action }) {
    if (action?.type !== 'do-task') return 'No workspace context'

    const integrations = action.integrations || []

    if (integrations.length === 0) {
      return 'No integrations configured'
    }

    return integrations.map(i => `- ${i.name} (${i.identifier})`).join('\n')
  }
})

export { agent }
