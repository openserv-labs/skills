/**
 * Secrets Example
 *
 * Demonstrates accessing workspace secrets.
 */
import { Agent } from '@openserv-labs/sdk'
import { z } from 'zod'

const agent = new Agent({
  systemPrompt: 'You are an assistant with access to workspace secrets.'
})

agent.addCapability({
  name: 'useSecret',
  description: 'Use a secret from the workspace',
  schema: z.object({
    secretName: z.string().describe('Name of the secret to use')
  }),
  async run({ args, action }) {
    if (action?.type !== 'do-task') return 'No workspace context'

    // Get all available secrets
    const secrets = await this.getSecrets({ workspaceId: action.workspace.id })

    // Find the secret by name
    const secret = secrets.find(s => s.name === args.secretName)

    if (!secret) {
      return `Secret "${args.secretName}" not found. Available: ${secrets.map(s => s.name).join(', ')}`
    }

    // Get the secret value
    const value = await this.getSecretValue({
      workspaceId: action.workspace.id,
      secretId: secret.id
    })

    // Use the secret (don't log it!)
    console.log(`Using secret ${args.secretName}...`)

    return `Successfully used secret "${args.secretName}"`
  }
})

export { agent }
