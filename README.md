# Cortex MCP - Task-Based Orchestration for AI Workflows

An MCP (Model Context Protocol) server for managing task-based workflows with artifact support across five orchestration phases: Explore, Search, Plan, Build, and Test.

## Features

- **Simplified Task Management** - Parent tasks with inline subtasks, no separate folders
- **Phase-Aware Artifacts** - Store and manage artifacts for each orchestration phase (explore, search, plan, build, test)
- **File-Based Storage** - All data stored in `.cortex/` directory with no database required
- **In-Memory Caching** - High-performance caching layer with TTL for frequently accessed tasks
- **Structured Logging** - Comprehensive logging with configurable levels

## Installation

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

### Creating Tasks

```
Tool: create_task
Parameters:
  - workingDirectory: path where tasks are stored
  - details: task description (generates task ID)
  - status (optional): pending | in_progress | done
  - tags (optional): categorization tags
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
  - workingDirectory: project directory
  - taskId: which task to attach artifact to
  - content: markdown content
  - status: pending | in-progress | completed | failed | skipped
  - retries, error: optional metadata
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
  details: string;               // Full task description
  status: 'pending' | 'in_progress' | 'done';
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // Last modification timestamp
  tags?: string[];               // Categorization tags
  actualHours?: number;          // Time tracking
  subtasks: Subtask[];           // Array of subtasks
}
```

### Subtask
```typescript
interface Subtask {
  id: string;                    // Simple ID ("1", "2", etc.)
  details: string;               // Subtask description
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
    retries?: number;             // Attempt count
    error?: string;               // Error message if status=failed
  }
  content: string;               // Markdown content
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

## Development

```bash
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

## Version

Current version: **5.0.0**

- v5.0.0: Simplified model - subtasks stored inline, removed dependencies, removed move_task
- v4.0.0: Complete refactor with artifact support and optimized build
- v3.x: Legacy memory features (deprecated)
- v1.x: Initial implementation

## License

MIT - See LICENSE file for details

## Author

Geanatz

## Contributing

Contributions welcome!
