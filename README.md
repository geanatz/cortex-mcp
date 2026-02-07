# Cortex MCP - Task-Based Orchestration for AI Workflows

An MCP (Model Context Protocol) server for managing task-based workflows with artifact support across five orchestration phases: Explore, Search, Plan, Build, and Test.

## Features

- **Simplified Task Management** - Parent tasks with inline subtasks, no separate folders
- **Phase-Aware Artifacts** - Store and manage artifacts for each orchestration phase (explore, search, plan, build, test)
- **File-Based Storage** - All data stored in `.cortex/` directory with no database required
- **In-Memory Caching** - High-performance caching layer with TTL for frequently accessed tasks
- **Structured Logging** - Comprehensive logging with configurable levels
- **Production Ready** - Path traversal protection, input validation, size limits, error handling

## Installation

### Using npx (Recommended)

Run the latest version without installing:

```bash
npx -y @geanatz/cortex-mcp@latest
```

### Global Installation

```bash
npm install -g @geanatz/cortex-mcp
```

### Local Installation

```bash
npm install @geanatz/cortex-mcp
```

## Usage

### Starting the Server

```bash
# Project-specific mode (stores in .cortex/ )
cortex-mcp

# Global mode (stores in ~/.cortex/)
cortex-mcp --claude
```

### MCP Configuration

Add to your MCP settings (e.g., Claude Desktop, Cursor, etc.):

```json
{
  "cortex": {
    "type": "local",
    "enabled": true,
    "command": [
      "npx",
      "-y",
      "@geanatz/cortex-mcp@latest"
    ]
  }
}
```

Or for global mode:

```json
{
  "cortex": {
    "type": "local",
    "enabled": true,
    "command": [
      "npx",
      "-y",
      "@geanatz/cortex-mcp@latest",
      "--claude"
    ]
  }
}
```

### Creating Tasks

```
Tool: create_task
Description: Create a new parent task to organize related work items and establish a clear development objective. Automatically generates unique task ID from description and initializes tracking metadata. Use to begin structured development on a specific feature or fix.
Parameters:
  - workingDirectory: path where tasks are stored (absolute path, required)
  - details: comprehensive task description that clearly defines the objective, requirements, and expected outcome, max 2000 characters
  - status (optional): pending | in_progress | done
  - tags (optional): category tags for organizing and filtering related tasks, max 20 tags, max 50 chars each
```

### Managing Subtasks

Subtasks are created using `update_task` with the `addSubtask` parameter:

```
Tool: update_task
Description: Update task properties to reflect progress, adjust scope, or modify requirements. Manage subtasks to break down work, track time spent, and update status. Use to maintain accurate task tracking throughout the development lifecycle.
Parameters:
  - id: parent task ID
  - addSubtask: { details: "Detailed subtask description that defines a specific, actionable work item", status: "pending" }
  - updateSubtask: { id: "1", details: "Updated subtask description if requirements change", status: "done" }
  - removeSubtaskId: "1"
  - actualHours (optional): number, max 10000 hours
```

### Managing Artifacts

Each task can have artifacts for 5 phases with specific purposes:

- **explore**: Capture codebase analysis findings, architectural decisions, and discovered dependencies. Essential for understanding the current state before making changes.
- **search**: Document research on best practices, API documentation, and external solutions. Use when gathering information to inform implementation decisions.
- **plan**: Define the step-by-step approach for task completion, including implementation strategy and required resources. Use to establish a clear roadmap before execution.
- **build**: Record actual implementation changes, code modifications, and development progress. Critical for tracking what was done and why.
- **test**: Document verification results, test outcomes, and quality assurance findings. Use to validate that changes meet requirements and don't introduce regressions.

```
Tools: create_{phase}, update_{phase}, delete_{phase}
Parameters:
  - workingDirectory: project directory (absolute path)
  - taskId: which task to attach artifact to
  - content: markdown content describing the work performed in this phase, max 10MB
  - status: pending | in-progress | completed | failed | skipped
  - retries (optional): integer, max 100
  - error (optional): error message if status is failed, max 10,000 characters
```

## Storage Format

Tasks are stored in `.cortex/tasks/{number}-{slug}/` directories:

```
.cortex/
└── tasks/
    ├── 001-implement-auth/
    │   ├── .task.json          (parent task + subtasks array)
    │   ├── explore.md         (explore phase artifact)
    │   ├── search.md          (search phase artifact)
    │   ├── plan.md            (plan phase artifact)
    │   ├── build.md           (build phase artifact)
    │   └── test.md            (test phase artifact)
    └── 002-setup-database/
        ├── .task.json
        └── ... (optional artifacts)
```

### Task JSON Structure

```json
{
  "id": "001-implement-auth",
  "details": "Implement authentication system",
  "status": "in_progress",
  "tags": ["auth", "backend"],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "actualHours": 2.5,
  "subtasks": [
    { "id": "1", "details": "Setup JWT library", "status": "done" },
    { "id": "2", "details": "Create login endpoint", "status": "in_progress" },
    { "id": "3", "details": "Add middleware", "status": "pending" }
  ]
}
```

## Data Model

### Task (Parent)
```typescript
interface Task {
  id: string;                    // Task ID (e.g., "001-implement-auth")
  details: string;               // Full task description (max 2000 chars)
  status: 'pending' | 'in_progress' | 'done';
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // Last modification timestamp
  tags?: string[];               // Categorization tags (max 20, max 50 chars each)
  actualHours?: number;          // Time tracking (max 10000 hours)
  subtasks: Subtask[];           // Array of subtasks
}
```

### Subtask
```typescript
interface Subtask {
  id: string;                    // Simple ID ("1", "2", etc.)
  details: string;               // Subtask description (max 1000 chars)
  status: 'pending' | 'in_progress' | 'done';
}
```

### Artifact
```typescript
interface Artifact {
  metadata: {
    phase: 'explore' | 'search' | 'plan' | 'build' | 'test';
    status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
    createdAt: string;            // ISO 8601
    updatedAt: string;            // ISO 8601
    retries?: number;             // Attempt count (max 100)
    error?: string;               // Error message (max 10000 chars)
  }
  content: string;               // Markdown content (max 10MB)
}
```

## Available Tools

### Task Management
- `create_task` - Create a new parent task to organize related work items and establish a clear development objective. Automatically generates unique task ID from description and initializes tracking metadata. Use to begin structured development on a specific feature or fix.
- `list_tasks` - List all tasks with hierarchical display showing progress, status, and subtasks. Essential for understanding current workflow state, tracking progress, and identifying next steps in the development process.
- `get_task` - Retrieve complete task details including all subtasks, status, artifacts, and progress metrics. Essential for understanding current task state, reviewing accumulated knowledge across all phases, and determining next steps in the development workflow.
- `update_task` - Update task properties to reflect progress, adjust scope, or modify requirements. Manage subtasks to break down work, track time spent, and update status. Use to maintain accurate task tracking throughout the development lifecycle.
- `delete_task` - Permanently delete a task and all its associated subtasks, artifacts, and progress data. Use only when a task is obsolete, no longer needed, or was created by mistake. Requires explicit confirmation to prevent accidental data loss.

### Artifact Management
#### Explore Phase
- `create_explore` - Create the explore artifact to capture codebase analysis findings, architectural decisions, and discovered dependencies. Essential for understanding the current state before making changes.
- `update_explore` - Update the explore artifact to refine analysis findings, add newly discovered information, or correct previous assessments about the codebase.
- `delete_explore` - Delete the explore artifact to reset the analysis phase and start fresh analysis of the codebase from scratch.

#### Search Phase
- `create_search` - Create the search artifact to document research on best practices, API documentation, and external solutions. Use when gathering information to inform implementation decisions.
- `update_search` - Update the search artifact to incorporate new research findings, updated best practices, or additional external resources discovered during implementation.
- `delete_search` - Delete the search artifact to clear previous research and initiate a new investigation of external resources and solutions.

#### Plan Phase
- `create_plan` - Create the plan artifact to define the step-by-step approach for task completion, including implementation strategy and required resources. Use to establish a clear roadmap before execution.
- `update_plan` - Update the plan artifact to adjust the implementation approach, modify steps, or adapt the strategy based on new information or changing requirements.
- `delete_plan` - Delete the plan artifact to abandon the current implementation strategy and develop a new approach from scratch.

#### Build Phase
- `create_build` - Create the build artifact to record actual implementation changes, code modifications, and development progress. Critical for tracking what was done and why.
- `update_build` - Update the build artifact to reflect additional implementation changes, code adjustments, or progress updates during the development process.
- `delete_build` - Delete the build artifact to clear the implementation record and restart the development process for the task.

#### Test Phase
- `create_test` - Create the test artifact to document verification results, test outcomes, and quality assurance findings. Use to validate that changes meet requirements and don't introduce regressions.
- `update_test` - Update the test artifact to record additional test results, verification outcomes, or quality metrics as testing continues throughout the development cycle.
- `delete_test` - Delete the test artifact to reset verification results and begin a new round of quality assurance testing.

## Configuration

### Environment Variables
- `DEBUG=true` - Enable debug logging

### Command-Line Flags
- `--claude` - Use global directory mode (~/.cortex/)

### Security Considerations

This server implements several security measures:

1. **Path Traversal Protection**: All paths are validated to prevent `../` sequences and directory escape
2. **Input Validation**: All inputs are validated using Zod schemas with strict limits
3. **Size Limits**: 
   - Task details: max 2000 characters
   - Artifact content: max 10MB
   - Tags: max 20 tags, max 50 characters each
   - Error messages: max 10,000 characters
4. **Working Directory Validation**: Must be absolute paths without traversal sequences
5. **Atomic File Writes**: Uses temp files and atomic rename to prevent data corruption
6. **Safe Error Messages**: Internal paths are not exposed in error messages

### Validation Limits

| Field | Limit |
|-------|-------|
| Task ID | 100 characters |
| Task details | 2000 characters |
| Subtask details | 1000 characters |
| Tags | 20 tags max, 50 chars each |
| Actual hours | Max 10,000 |
| Artifact content | 10MB max |
| Error messages | 10,000 characters max |
| Retries | Max 100 |
| Working directory path | 4096 characters max |

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode
npm run dev

# Start server
npm start
```

### Build Optimization
- Uses TypeScript with incremental builds
- Optimized for <5s build times with ~800MB memory usage
- Proper closure elimination for fast type inference

## Architecture

- **Clean layering** - Types → Utilities → Storage → Tools → Server
- **No circular dependencies** - Easy to understand data flow
- **Abstract storage** - File-based implementation, easily extensible
- **MCP-compliant** - Full compliance with Model Context Protocol specification
- **Security-first** - Path validation, input sanitization, size limits

## Error Handling

The server uses a comprehensive error handling strategy:

- **AppError hierarchy** - Typed errors with context
- **Zod validation** - Schema validation at the boundary
- **Graceful degradation** - Continues operating on non-fatal errors
- **Structured logging** - All errors logged with context to stderr
- **Safe shutdown** - SIGINT/SIGTERM handlers for graceful exit

## Troubleshooting

### Connection closed errors
- Check that the working directory exists and is accessible
- Verify the working directory is an absolute path
- Ensure no path traversal sequences (../) in workingDirectory

### Permission denied errors
- Verify write permissions to the working directory
- Check if the .cortex directory is owned by the current user

### Storage not initializing
- Ensure the path is an absolute path (not relative)
- Check that parent directories exist and are writable

## Version

Current version: **5.0.4**

### Changelog

- **v5.0.4**: Enhanced AI agent tool descriptions and optimized parameter documentation for better LLM understanding (expanded descriptions beyond v5.0.3)
- **v5.0.3**: Initial release with improved tool descriptions
- **v5.0.2**: Security hardening - path traversal protection, input validation, size limits
- **v5.0.1**: Added error handlers for connection stability
- **v5.0.0**: Simplified model - subtasks stored inline, removed dependencies, removed move_task
- **v4.0.0**: Complete refactor with artifact support and optimized build
- **v3.x**: Legacy memory features (deprecated)
- **v1.x**: Initial implementation

## License

MIT - See LICENSE file for details

## Author

Geanatz

## Contributing

Contributions welcome! Please ensure:
- Code follows existing patterns
- All inputs are validated
- Security considerations are addressed
- Tests pass (when test suite is added)

## Security

For security issues, please email directly rather than opening a public issue.

### Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly by contacting the maintainer directly.
