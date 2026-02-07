# Cortex MCP - Task-Based Orchestration for AI Workflows

An MCP (Model Context Protocol) server for managing task-based workflows with artifact support across five orchestration phases: Explore, Search, Plan, Build, and Test.

## Features

- **Hierarchical Task Management** - Create unlimited nested task hierarchies
- **Phase-Aware Artifacts** - Store and manage artifacts for each orchestration phase (explore, search, plan, build, test)
- **Task Dependencies** - Define dependencies between tasks to track blocking workflows
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
Tool: cortex_create_task
Parameters:
  - workingDirectory: path where tasks are stored
  - details: task description (generates task ID)
  - parentId (optional): create as subtask
  - status (optional): pending | in_progress | done
  - tags (optional): categorization tags
  - dependsOn (optional): blocking task IDs
```

### Managing Artifacts

Each task can have artifacts for 5 phases:
- **explore**: Codebase analysis and discovery findings
- **search**: External research and documentation findings
- **plan**: Implementation approach and step-by-step plan
- **build**: Implementation changes and modifications made
- **test**: Test execution results and verification status

```
Tools: cortex_create_{phase}, cortex_update_{phase}, cortex_delete_{phase}
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
    │   ├── task.json          (task metadata)
    │   ├── explore.md         (explore phase artifact)
    │   ├── search.md          (search phase artifact)
    │   ├── plan.md            (plan phase artifact)
    │   ├── build.md           (build phase artifact)
    │   └── test.md            (test phase artifact)
    ├── 002-setup-database/
    │   ├── task.json
    │   └── ... (optional artifacts)
    └── 003-test-integration/
        ├── task.json
        └── ... (optional artifacts)
```

## Data Model

### Task
```typescript
interface Task {
  id: string;                    // Task ID (e.g., "001-implement-auth")
  details: string;               // Full task description/requirements
  parentId?: string;             // Parent task for hierarchy
  status: 'pending'              //  'in_progress' | 'done'
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // Last modification timestamp
  dependsOn?: string[];          // List of blocking task IDs
  tags?: string[];               // Categorization tags
  actualHours?: number;          // Time tracking
  level?: number;                // Nesting depth (calculated)
}
```

### Artifact
```typescript
interface Artifact {
  metadata: {
    phase: 'explore'             // | 'search' | 'plan' | 'build' | 'test'
    status: 'pending'             // | 'in-progress' | 'completed' | 'failed' | 'skipped'
    createdAt: string;            // ISO 8601
    updatedAt: string;            // ISO 8601
    retries?: number;             // Attempt count
    error?: string;               // Error message if status=failed
  }
  content: string;               // Markdown content
}
```

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

Current version: **4.0.0**

- v4.0.0: Complete refactor with artifact support and optimized build
- v3.x: Legacy memory features (deprecated)
- v1.x: Initial implementation

## License

MIT - See LICENSE file for details

## Author

Geanatz

## Contributing

Contributions welcome!
