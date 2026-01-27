# API Reference

Complete reference for all MCP tools provided by the Agentic Tools MCP Server.

## Table of Contents

- [Task Management Tools](#task-management-tools)
- [Agent Memories Tools](#agent-memories-tools)
- [Common Parameters](#common-parameters)
- [Error Handling](#error-handling)

## Task Management Tools

### Projects

#### `list_projects_Agentic_Tools`
List all projects in the working directory.

**Parameters:**
- `workingDirectory` (string, required): Project working directory

**Returns:** List of projects with details

#### `create_project_Agentic_Tools`
Create a new project.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `name` (string, required): Project name
- `description` (string, required): Project description

**Returns:** Created project object

#### `get_project_Agentic_Tools`
Get a specific project by ID.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Project ID

**Returns:** Project object or error if not found

#### `update_project_Agentic_Tools`
Update an existing project.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Project ID
- `name` (string, optional): Updated name
- `description` (string, optional): Updated description

**Returns:** Updated project object

#### `delete_project_Agentic_Tools`
Delete a project and all its tasks/subtasks.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Project ID
- `confirm` (boolean, required): Confirmation flag

**Returns:** Success message or error

### Tasks

#### `list_tasks_Agentic_Tools`
List tasks with optional filtering.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `projectId` (string, optional): Filter by project ID

**Returns:** List of tasks

#### `create_task_Agentic_Tools`
Create a new task.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `name` (string, required): Task name
- `details` (string, required): Task details
- `projectId` (string, required): Parent project ID

**Returns:** Created task object

#### `get_task_Agentic_Tools`
Get a specific task by ID.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Task ID

**Returns:** Task object or error if not found

#### `update_task_Agentic_Tools`
Update an existing task.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Task ID
- `name` (string, optional): Updated name
- `details` (string, optional): Updated details
- `completed` (boolean, optional): Completion status

**Returns:** Updated task object

#### `delete_task_Agentic_Tools`
Delete a task and all its subtasks.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Task ID
- `confirm` (boolean, required): Confirmation flag

**Returns:** Success message or error

### Subtasks

#### `list_subtasks_Agentic_Tools`
List subtasks with optional filtering.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `taskId` (string, optional): Filter by task ID
- `projectId` (string, optional): Filter by project ID

**Returns:** List of subtasks

#### `create_subtask_Agentic_Tools`
Create a new subtask.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `name` (string, required): Subtask name
- `details` (string, required): Subtask details
- `taskId` (string, required): Parent task ID

**Returns:** Created subtask object

#### `get_subtask_Agentic_Tools`
Get a specific subtask by ID.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Subtask ID

**Returns:** Subtask object or error if not found

#### `update_subtask_Agentic_Tools`
Update an existing subtask.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Subtask ID
- `name` (string, optional): Updated name
- `details` (string, optional): Updated details
- `completed` (boolean, optional): Completion status

**Returns:** Updated subtask object

#### `delete_subtask_Agentic_Tools`
Delete a subtask.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Subtask ID
- `confirm` (boolean, required): Confirmation flag

**Returns:** Success message or error

## Agent Memories Tools

### `create_memory_Agentic_Tools`
Create a new memory with automatic embedding generation.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `content` (string, required): Memory content text (max 10,000 chars)
- `metadata` (object, optional): Additional metadata
- `agentId` (string, optional): Agent identifier (max 100 chars)
- `category` (string, optional): Memory category (max 100 chars)
- `importance` (number, optional): Importance score (1-10)
- `embedding` (number[], optional): Pre-computed embedding vector

**Returns:** Created memory object with generated ID and embedding

**Example:**
```json
{
  "workingDirectory": "/my/project",
  "content": "User prefers dark mode interface",
  "metadata": {"source": "user_preference"},
  "agentId": "assistant-1",
  "category": "preferences",
  "importance": 8
}
```

### `search_memories_Agentic_Tools`
Search memories using semantic similarity.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `query` (string, required): Search query text (max 1,000 chars)
- `limit` (number, optional): Maximum results (1-100, default: 10)
- `threshold` (number, optional): Similarity threshold (0-1, default: 0.3)
- `agentId` (string, optional): Filter by agent ID
- `category` (string, optional): Filter by category
- `minImportance` (number, optional): Minimum importance filter (1-10)

**Returns:** Array of search results with similarity scores

**Example:**
```json
{
  "workingDirectory": "/my/project",
  "query": "user interface preferences",
  "limit": 5,
  "threshold": 0.4,
  "category": "preferences"
}
```

### `get_memory_Agentic_Tools`
Retrieve a specific memory by ID.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Memory ID

**Returns:** Memory object with full details or error if not found

### `list_memories_Agentic_Tools`
List memories with optional filtering.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `agentId` (string, optional): Filter by agent ID (max 100 chars)
- `category` (string, optional): Filter by category (max 100 chars)
- `limit` (number, optional): Maximum results (1-1000, default: 50)

**Returns:** Array of memories sorted by creation date (newest first)

### `update_memory_Agentic_Tools`
Update an existing memory.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Memory ID
- `content` (string, optional): Updated content (max 10,000 chars)
- `metadata` (object, optional): Updated metadata
- `category` (string, optional): Updated category (max 100 chars)
- `importance` (number, optional): Updated importance (1-10)

**Returns:** Updated memory object with regenerated embedding (if content changed)

**Note:** At least one optional parameter must be provided.

### `delete_memory_Agentic_Tools`
Delete a memory permanently.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Memory ID
- `confirm` (boolean, required): Confirmation flag (must be true)

**Returns:** Success message with deleted memory details

## Common Parameters

### `workingDirectory`
- **Type:** string
- **Required:** Yes (all tools)
- **Description:** Absolute path to the project directory where data should be stored
- **Example:** `"/Users/username/my-project"` or `"C:\\Users\\username\\my-project"`

## Error Handling

All tools return standardized error responses:

```json
{
  "content": [{
    "type": "text",
    "text": "Error: Description of what went wrong"
  }],
  "isError": true
}
```

### Common Error Types

1. **Validation Errors**: Invalid parameters or missing required fields
2. **Not Found Errors**: Requested resource doesn't exist
3. **Storage Errors**: Database or file system issues
4. **Permission Errors**: Directory access or write permission issues

### Error Prevention

- Always provide valid `workingDirectory` paths
- Ensure directories exist and are writable
- Use confirmation flags for destructive operations
- Validate input lengths and formats before calling tools
- Handle errors gracefully in your application logic
