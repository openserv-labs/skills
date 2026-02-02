/**
 * Capability with Agent Methods Example
 *
 * Demonstrates using agent methods (this.addLogToTask, this.uploadFile, etc.)
 * inside capabilities.
 */
import { Agent } from '@openserv-labs/sdk'
import { z } from 'zod'
import OpenAI from 'openai'

const openai = new OpenAI()

const agent = new Agent({
  systemPrompt: 'You are a report generation assistant.'
})

agent.addCapability({
  name: 'generateReport',
  description: 'Generate a report and save it to the workspace',
  schema: z.object({
    topic: z.string().describe('Report topic'),
    format: z.enum(['brief', 'detailed']).optional()
  }),
  async run({ args, action }) {
    const { topic, format = 'brief' } = args

    // Only log/upload if we're in a task context
    if (action?.type === 'do-task' && action.task) {
      const { workspace, task } = action

      // Log progress
      await this.addLogToTask({
        workspaceId: workspace.id,
        taskId: task.id,
        severity: 'info',
        type: 'text',
        body: `Starting ${format} report on "${topic}"...`
      })

      // Generate report
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Generate a ${format} report.` },
          { role: 'user', content: `Report topic: ${topic}` }
        ]
      })
      const report = response.choices[0]?.message?.content || 'Report generation failed'

      // Upload as file
      await this.uploadFile({
        workspaceId: workspace.id,
        path: `reports/${topic.replace(/\s+/g, '-').toLowerCase()}.txt`,
        file: report,
        taskIds: [task.id]
      })

      // Log completion
      await this.addLogToTask({
        workspaceId: workspace.id,
        taskId: task.id,
        severity: 'info',
        type: 'text',
        body: 'Report generated and saved!'
      })

      return report
    }

    // Fallback if no task context
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Generate a ${format} report.` },
        { role: 'user', content: `Report topic: ${topic}` }
      ]
    })
    return response.choices[0]?.message?.content || 'Report generation failed'
  }
})

export { agent }
