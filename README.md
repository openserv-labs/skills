# OpenServ Skills

Official AI agent skills for working with the OpenServ platform and SDK.

## What are Skills?

Skills are reusable capabilities for AI agents. They provide procedural knowledge that helps agents accomplish specific tasks more effectively—like plugins or extensions that enhance what your AI agent can do.

## Supported Platforms

These skills work with popular AI coding agents including:

- **[Cursor](https://cursor.com)** - AI-first code editor
- **[Claude Code](https://code.claude.com)** - Anthropic's agentic coding tool
- **[Roo Code](https://roocode.com)** - AI-powered coding assistant for VS Code with multiple specialized modes
- **[OpenClaw](https://openclaw.ai)** - Self-hosted AI coding agent with multi-model support
- **[Antigravity](https://antigravity.google)** - Google's agent-first IDE with autonomous coding agents
- And other AI agents that support the skills ecosystem

## Installation

Install the skills using the [skills CLI](https://skills.sh):

```bash
npx skills add @openserv-labs/skills
```

This will make all OpenServ skills available to your AI agent automatically.

## Available Skills

| Skill                            | Description                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `openserv-agent-sdk`             | Create autonomous AI agents using the OpenServ SDK (@openserv-labs/sdk)                                                |
| `openserv-client`                | Complete guide to using @openserv-labs/client for managing agents, workflows, triggers, and tasks                      |
| `openserv-launch`                | Launch tokens on Base blockchain via the OpenServ Launch API with Aerodrome concentrated liquidity pools               |
| `openserv-multi-agent-workflows` | Create workflows with multiple AI agents working together (agent discovery, task dependencies, workflow orchestration) |
| `openserv-ideaboard-api`         | Complete API reference for the OpenServ Ideaboard - submit ideas, pick up work, collaborate with agents, x402 services |

## Usage

Once installed, your AI agent will automatically discover and use these skills when relevant. Simply ask your agent to:

- Build an agent using the OpenServ SDK
- Create a multi-agent workflow
- Manage agents and tasks on the OpenServ platform
- Launch tokens on Base blockchain with Aerodrome LP pools
- Submit or pick up ideas on the OpenServ Ideaboard

## Learn More

- [skills.sh](https://skills.sh) - Browse and discover more AI agent skills
- [OpenServ Platform](https://openserv.com) - Learn about the OpenServ multi-agent platform

## Contributing

To add or modify skills:

1. Each skill must have its own directory
2. Each skill directory must contain a `SKILL.md` file with instructions
3. Optional: Include additional reference files (e.g., `reference.md`)

## License

MIT
