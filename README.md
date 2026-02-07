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
Parameters:
  - workingDirectory: path where tasks are stored (absolute path, required)
  - details: task description (generates task ID), max 2000 characters
  - status (optional): pending | in_progress | done
  - tags (optional): categorization tags, max 20 tags, max 50 chars each
```

### Managing Subtasks

Subtasks are created using `update_task` with the `addSubtask` parameter:

```
Tool: update_task
Parameters:
  - id: parent task ID
  - addSubtask: { details: "Subtask description", status: "pending" }
  - updateSubtask: { id: "1", status: "done" }
  - removeSubtaskId: "1"
  - actualHours (optional): number, max 10000 hours
```

### Managing Artifacts

Each task can have artifacts for 5 phases:
- **explore**: Codebase analysis and discovery findings
- **search**: External research and documentation findings
- **plan**: Implementation approach and step-by-step plan
- **build**: Implementation changes and modifications made
- **test**: Test execution results and verification status

```
Tools: create_{phase}, update_{phase}, delete_{phase}
Parameters:
  - workingDirectory: project directory (absolute path)
  - taskId: which task to attach artifact to
  - content: markdown content, max 10MB
  - status: pending | in-progress | completed | failed | skipped
  - retries (optional): integer, max 100
  - error (optional): error message, max 10,000 characters
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
- `create_task` - Create a new parent task
- `list_tasks` - List all tasks with subtasks
- `get_task` - Get task details including subtasks and artifacts
- `update_task` - Update task and manage subtasks
- `delete_task` - Delete task and all its subtasks

### Artifact Management
- `create_explore` - Create explore phase artifact
- `update_explore` - Update explore phase artifact
- `delete_explore` - Delete explore phase artifact
- `create_search` - Create search phase artifact
- `update_search` - Update search phase artifact
- `delete_search` - Delete search phase artifact
- `create_plan` - Create plan phase artifact
- `update_plan` - Update plan phase artifact
- `delete_plan` - Delete plan phase artifact
- `create_build` - Create build phase artifact
- `update_build` - Update build phase artifact
- `delete_build` - Delete build phase artifact
- `create_test` - Create test phase artifact
- `update_test` - Update test phase artifact
- `delete_test` - Delete test phase artifact

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

Current version: **5.0.2**

### Changelog

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
