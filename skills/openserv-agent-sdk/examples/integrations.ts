/**
 * Integration Examples — Calling external services through the OpenServ proxy
 *
 * Shows callIntegration() with Gmail, Slack, Twitter, YouTube, Google Calendar, Google Drive, and Jira.
 * The platform handles OAuth — the user must connect integrations on the UI first.
 *
 * NOTE: callIntegration() does NOT throw on upstream API errors — they come back as
 * normal response objects. In production, validate responses for error structures.
 *
 * JIRA NOTE: Jira requires a cloudId prefix on all API endpoints. The proxy does not
 * apply this automatically, so you must resolve it first via /oauth/token/accessible-resources
 * and prepend /ex/jira/{cloudId} to every endpoint.
 */
import dotenv from 'dotenv'
dotenv.config()

import { Agent, run } from '@openserv-labs/sdk'
import { provision, triggers } from '@openserv-labs/client'
import { z } from 'zod'

const agent = new Agent({
  systemPrompt: 'You are a multi-service agent that can interact with Gmail, Slack, Twitter, YouTube, Google Calendar, Google Drive, and Jira.'
})

// Helper: resolve Jira cloudId (required for all Jira API calls)
async function resolveJiraCloudId(agent: Agent, workspaceId: string): Promise<string | null> {
  const resources: any = await agent.callIntegration({
    workspaceId, integrationId: 'jira',
    details: { endpoint: '/oauth/token/accessible-resources', method: 'GET' }
  })
  return resources?.[0]?.id ?? null
}

// Gmail: list + fetch message metadata
agent.addCapability({
  name: 'fetchEmails',
  description: 'Fetch recent emails from Gmail',
  inputSchema: z.object({
    maxEmails: z.number().optional().describe('Max emails (default 10)'),
    label: z.string().optional().describe('INBOX, UNREAD, or STARRED')
  }),
  async run({ args, action }) {
    const workspaceId = String(action.workspace.id)
    const list: any = await this.callIntegration({
      workspaceId, integrationId: 'google-mail',
      details: { endpoint: '/gmail/v1/users/me/messages', method: 'GET',
        params: { maxResults: args.maxEmails ?? 10, labelIds: args.label ?? 'INBOX' } }
    })

    const emails: string[] = []
    for (const stub of (list?.messages ?? []).slice(0, args.maxEmails ?? 10)) {
      const msg: any = await this.callIntegration({
        workspaceId, integrationId: 'google-mail',
        details: { endpoint: `/gmail/v1/users/me/messages/${stub.id}`, method: 'GET',
          params: { format: 'metadata', metadataHeaders: 'From,To,Subject,Date' } }
      })
      const h = (name: string) => msg.payload?.headers?.find((x: any) => x.name.toLowerCase() === name.toLowerCase())?.value ?? ''
      emails.push(`From: ${h('From')} | Subject: ${h('Subject')} | Date: ${h('Date')}`)
    }
    return emails.length ? await this.generate({ prompt: `Summarize these emails:\n${emails.join('\n')}`, action }) : 'No emails found.'
  }
})

// Slack: list channels (uploads raw response for debugging)
agent.addCapability({
  name: 'listSlackChannels',
  description: 'List Slack channels the bot has access to',
  inputSchema: z.object({
    limit: z.number().optional().describe('Max channels (default 50)')
  }),
  async run({ args, action }) {
    const workspaceId = String(action.workspace.id)
    const taskId = action?.type === 'do-task' && action.task ? action.task.id : undefined

    const result: any = await this.callIntegration({
      workspaceId, integrationId: 'slack',
      details: { endpoint: '/conversations.list', method: 'GET',
        params: { limit: args.limit ?? 50, types: 'public_channel,private_channel' } }
    })

    await this.uploadFile({
      workspaceId, path: 'slack-channels.json',
      file: JSON.stringify(result, null, 2),
      taskIds: taskId ? [taskId] : []
    })

    const channels = result?.channels ?? []
    if (!channels.length) return 'No channels found.'
    return channels.map((c: any, i: number) =>
      `${i + 1}. #${c.name} (${c.id}) — ${c.num_members ?? '?'} members`
    ).join('\n')
  }
})

// Slack: send a message
agent.addCapability({
  name: 'sendSlackMessage',
  description: 'Send a message to a Slack channel',
  inputSchema: z.object({
    channel: z.string().describe('Channel ID (e.g. C01234ABCDE)'),
    message: z.string()
  }),
  async run({ args, action }) {
    const result: any = await this.callIntegration({
      workspaceId: String(action.workspace.id), integrationId: 'slack',
      details: { endpoint: '/chat.postMessage', method: 'POST', data: { channel: args.channel, text: args.message } }
    })
    return result.ok ? `Sent to ${args.channel}` : `Failed: ${result.error}`
  }
})

// Twitter: get a user's latest tweets (lookup → timeline → upload file)
agent.addCapability({
  name: 'getLatestTweets',
  description: 'Get latest tweets from a Twitter/X user by username',
  inputSchema: z.object({
    username: z.string().describe('Twitter username without @ (e.g. "openservai")'),
    maxResults: z.number().optional().describe('Max tweets (default 10, max 100)')
  }),
  async run({ args, action }) {
    const workspaceId = String(action.workspace.id)
    const username = args.username.replace(/^@/, '')
    const taskId = action?.type === 'do-task' && action.task ? action.task.id : undefined

    const userResult: any = await this.callIntegration({
      workspaceId, integrationId: 'twitter-v2',
      details: { endpoint: `/2/users/by/username/${username}`, method: 'GET',
        params: { 'user.fields': 'name,public_metrics' } }
    })
    const userId = userResult?.data?.id
    if (!userId) return `User @${username} not found.`

    const tweetsResult: any = await this.callIntegration({
      workspaceId, integrationId: 'twitter-v2',
      details: { endpoint: `/2/users/${userId}/tweets`, method: 'GET',
        params: { max_results: String(Math.min(args.maxResults ?? 10, 100)),
          'tweet.fields': 'created_at,text,public_metrics', exclude: 'retweets,replies' } }
    })

    const tweets = tweetsResult?.data ?? []
    if (!tweets.length) return `No recent tweets from @${username}.`

    const content = tweets.map((t: any, i: number) =>
      `${i + 1}. (${t.created_at}) ${t.text} [♥${t.public_metrics?.like_count} ↻${t.public_metrics?.retweet_count}]`
    ).join('\n')

    await this.uploadFile({
      workspaceId, path: `tweets-${username}-${Date.now()}.txt`,
      file: content, taskIds: taskId ? [taskId] : []
    })
    return `Uploaded ${tweets.length} tweets from @${username}.`
  }
})

// YouTube: list own channels (uploads raw response for debugging)
agent.addCapability({
  name: 'listMyYouTubeChannels',
  description: 'List my own YouTube channels with statistics',
  inputSchema: z.object({}),
  async run({ args, action }) {
    const workspaceId = String(action.workspace.id)
    const taskId = action?.type === 'do-task' && action.task ? action.task.id : undefined

    const result: any = await this.callIntegration({
      workspaceId, integrationId: 'youtube',
      details: { endpoint: '/youtube/v3/channels', method: 'GET',
        params: { mine: 'true', part: 'snippet,statistics' } }
    })

    await this.uploadFile({
      workspaceId, path: 'youtube-channels.json',
      file: JSON.stringify(result, null, 2),
      taskIds: taskId ? [taskId] : []
    })

    const channels = result?.items ?? []
    if (!channels.length) return 'No channels found.'
    return channels.map((c: any, i: number) => {
      const s = c.statistics ?? {}
      return `${i + 1}. ${c.snippet?.title ?? '(no title)'} — ${s.subscriberCount ?? '?'} subs, ${s.videoCount ?? '?'} videos`
    }).join('\n')
  }
})

// YouTube: search videos (uploads raw response for debugging)
agent.addCapability({
  name: 'searchYouTubeVideos',
  description: 'Search for YouTube videos',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().optional().describe('Max results (default 10)')
  }),
  async run({ args, action }) {
    const workspaceId = String(action.workspace.id)
    const taskId = action?.type === 'do-task' && action.task ? action.task.id : undefined

    const result: any = await this.callIntegration({
      workspaceId, integrationId: 'youtube',
      details: { endpoint: '/youtube/v3/search', method: 'GET',
        params: { q: args.query, type: 'video', part: 'snippet', maxResults: args.maxResults ?? 10 } }
    })

    await this.uploadFile({
      workspaceId, path: 'youtube-search.json',
      file: JSON.stringify(result, null, 2),
      taskIds: taskId ? [taskId] : []
    })

    const videos = result?.items ?? []
    if (!videos.length) return 'No videos found.'
    return videos.map((v: any, i: number) => {
      const title = v.snippet?.title ?? '(no title)'
      const channel = v.snippet?.channelTitle ?? ''
      const published = v.snippet?.publishedAt ?? ''
      return `${i + 1}. ${title} — ${channel} (${published})`
    }).join('\n')
  }
})

// YouTube: list playlists (uploads raw response for debugging)
agent.addCapability({
  name: 'listYouTubePlaylists',
  description: 'List my YouTube playlists',
  inputSchema: z.object({}),
  async run({ args, action }) {
    const workspaceId = String(action.workspace.id)
    const taskId = action?.type === 'do-task' && action.task ? action.task.id : undefined

    const result: any = await this.callIntegration({
      workspaceId, integrationId: 'youtube',
      details: { endpoint: '/youtube/v3/playlists', method: 'GET',
        params: { mine: 'true', part: 'snippet' } }
    })

    await this.uploadFile({
      workspaceId, path: 'youtube-playlists.json',
      file: JSON.stringify(result, null, 2),
      taskIds: taskId ? [taskId] : []
    })

    const playlists = result?.items ?? []
    if (!playlists.length) return 'No playlists found.'
    return playlists.map((p: any, i: number) =>
      `${i + 1}. ${p.snippet?.title ?? '(no title)'}`
    ).join('\n')
  }
})

// Google Calendar: list upcoming events (uploads raw response for debugging)
agent.addCapability({
  name: 'listCalendarEvents',
  description: 'List upcoming Google Calendar events',
  inputSchema: z.object({
    maxEvents: z.number().optional().describe('Max events (default 10)')
  }),
  async run({ args, action }) {
    const workspaceId = String(action.workspace.id)
    const taskId = action?.type === 'do-task' && action.task ? action.task.id : undefined

    const result: any = await this.callIntegration({
      workspaceId, integrationId: 'google-calendar',
      details: { endpoint: '/calendar/v3/calendars/primary/events', method: 'GET',
        params: {
          timeMin: new Date().toISOString(),
          maxResults: args.maxEvents ?? 10,
          singleEvents: 'true',
          orderBy: 'startTime'
        } }
    })

    await this.uploadFile({
      workspaceId, path: 'calendar-events.json',
      file: JSON.stringify(result, null, 2),
      taskIds: taskId ? [taskId] : []
    })

    const events = result?.items ?? []
    if (!events.length) return 'No upcoming events found.'
    return events.map((e: any, i: number) => {
      const start = e.start?.dateTime ?? e.start?.date ?? ''
      return `${i + 1}. ${e.summary ?? '(no title)'} — ${start}`
    }).join('\n')
  }
})

// Google Calendar: create an event
agent.addCapability({
  name: 'createCalendarEvent',
  description: 'Create a Google Calendar event',
  inputSchema: z.object({
    title: z.string(),
    startTime: z.string().describe('ISO 8601'),
    endTime: z.string().describe('ISO 8601'),
    description: z.string().optional()
  }),
  async run({ args, action }) {
    const event: any = await this.callIntegration({
      workspaceId: String(action.workspace.id), integrationId: 'google-calendar',
      details: { endpoint: '/calendar/v3/calendars/primary/events', method: 'POST',
        data: { summary: args.title, description: args.description,
          start: { dateTime: args.startTime }, end: { dateTime: args.endTime } } }
    })
    return `Event created: ${event.htmlLink ?? event.id}`
  }
})

// Google Drive: list recent files (uploads raw response for debugging)
agent.addCapability({
  name: 'listDriveFiles',
  description: 'List recent files from Google Drive',
  inputSchema: z.object({
    maxFiles: z.number().optional().describe('Max files (default 20)')
  }),
  async run({ args, action }) {
    const workspaceId = String(action.workspace.id)
    const taskId = action?.type === 'do-task' && action.task ? action.task.id : undefined

    const result: any = await this.callIntegration({
      workspaceId, integrationId: 'google-drive',
      details: { endpoint: '/drive/v3/files', method: 'GET',
        params: { pageSize: args.maxFiles ?? 20, orderBy: 'modifiedTime desc' } }
    })

    await this.uploadFile({
      workspaceId, path: 'drive-files.json',
      file: JSON.stringify(result, null, 2),
      taskIds: taskId ? [taskId] : []
    })

    const files = result?.files ?? []
    if (!files.length) return 'No files found.'
    return files.map((f: any, i: number) =>
      `${i + 1}. ${f.name} (${f.mimeType})`
    ).join('\n')
  }
})

// Jira: list projects (requires cloudId workaround)
agent.addCapability({
  name: 'listJiraProjects',
  description: 'List Jira projects',
  inputSchema: z.object({}),
  async run({ args, action }) {
    const workspaceId = String(action.workspace.id)
    const taskId = action?.type === 'do-task' && action.task ? action.task.id : undefined

    const cloudId = await resolveJiraCloudId(this, workspaceId)
    if (!cloudId) return 'Could not resolve Jira cloudId. Is Jira connected?'

    const result: any = await this.callIntegration({
      workspaceId, integrationId: 'jira',
      details: { endpoint: `/ex/jira/${cloudId}/rest/api/3/project`, method: 'GET' }
    })

    await this.uploadFile({
      workspaceId, path: 'jira-projects.json',
      file: JSON.stringify(result, null, 2),
      taskIds: taskId ? [taskId] : []
    })

    const projects = Array.isArray(result) ? result : []
    if (!projects.length) return 'No projects found.'
    return projects.map((p: any, i: number) =>
      `${i + 1}. ${p.key} — ${p.name} (${p.projectTypeKey ?? ''})`
    ).join('\n')
  }
})

// Jira: search issues with JQL (requires cloudId workaround, uses POST)
agent.addCapability({
  name: 'searchJiraIssues',
  description: 'Search Jira issues using JQL',
  inputSchema: z.object({
    jql: z.string().optional().describe('JQL query (default: recent issues)'),
    maxResults: z.number().optional().describe('Max results (default 20)')
  }),
  async run({ args, action }) {
    const workspaceId = String(action.workspace.id)
    const taskId = action?.type === 'do-task' && action.task ? action.task.id : undefined

    const cloudId = await resolveJiraCloudId(this, workspaceId)
    if (!cloudId) return 'Could not resolve Jira cloudId. Is Jira connected?'

    const result: any = await this.callIntegration({
      workspaceId, integrationId: 'jira',
      details: {
        endpoint: `/ex/jira/${cloudId}/rest/api/3/search`, method: 'POST',
        data: { jql: args.jql ?? 'order by updated DESC', maxResults: args.maxResults ?? 20 }
      }
    })

    await this.uploadFile({
      workspaceId, path: 'jira-issues.json',
      file: JSON.stringify(result, null, 2),
      taskIds: taskId ? [taskId] : []
    })

    const issues = result?.issues ?? []
    if (!issues.length) return 'No issues found.'
    return issues.map((iss: any, i: number) => {
      const key = iss.key ?? ''
      const summary = iss.fields?.summary ?? '(no summary)'
      const status = iss.fields?.status?.name ?? ''
      const assignee = iss.fields?.assignee?.displayName ?? 'Unassigned'
      return `${i + 1}. ${key}: ${summary} [${status}] — ${assignee}`
    }).join('\n')
  }
})

async function main() {
  const result = await provision({
    agent: { instance: agent, name: 'multi-service-agent', description: 'Gmail, Slack, Twitter, YouTube, Calendar, Drive, and Jira agent' },
    workflow: {
      name: 'Multi-Service Hub',
      goal: 'Unified interface to Gmail, Slack, Twitter, YouTube, Google Calendar, Google Drive, and Jira via natural language',
      trigger: triggers.webhook({ waitForCompletion: true, timeout: 600 }),
      task: { description: 'Process the request using the appropriate integration' }
    }
  })
  dotenv.config({ override: true })
  await run(agent)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
