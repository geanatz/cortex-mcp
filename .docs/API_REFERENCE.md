# API Reference

Complete reference for all MCP tools provided by the Cortex MCP Server.

## Table of Contents

- [Task Management Tools](#task-management-tools)
- [Agent Memories Tools](#agent-memories-tools)
- [Common Parameters](#common-parameters)
- [Error Handling](#error-handling)

## Task Management Tools

### Tasks

#### `list_tasks`
List tasks with optional filtering and hierarchical display.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `parentId` (string, optional): Filter by parent task ID
- `showHierarchy` (boolean, optional): Show hierarchical tree (default: true)
- `includeCompleted` (boolean, optional): Include completed tasks (default: true)

**Returns:** List of tasks with optional hierarchy

#### `create_task`
Create a new task.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `details` (string, required): Task details
- `parentId` (string, optional): Parent task ID for nesting
- `dependsOn` (string[], optional): Task dependencies
- `status` (string, optional): Status (`pending`, `in-progress`, `blocked`, `done`)
- `tags` (string[], optional): Tags for categorization

**Returns:** Created task object

#### `get_task`
Get a specific task by ID.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Task ID

**Returns:** Task object or error if not found

#### `update_task`
Update an existing task.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Task ID
- `details` (string, optional): Updated details
- `parentId` (string, optional): Updated parent task ID
- `completed` (boolean, optional): Completion status
- `dependsOn` (string[], optional): Updated dependencies
- `status` (string, optional): Updated status
- `tags` (string[], optional): Updated tags
- `actualHours` (number, optional): Actual hours spent

**Returns:** Updated task object

#### `delete_task`
Delete a task and all its child tasks.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Task ID
- `confirm` (boolean, required): Confirmation flag

**Returns:** Success message or error

#### `move_task`
Move a task to a different parent in the hierarchy.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `taskId` (string, required): Task ID to move
- `newParentId` (string, optional): New parent task ID

**Returns:** Updated task object

## Agent Memories Tools

### `create_memory`
Create a new memory.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `title` (string, required): Memory title (max 50 chars)
- `content` (string, required): Memory content text
- `metadata` (object, optional): Additional metadata
- `category` (string, optional): Memory category (max 100 chars)

**Returns:** Created memory object

**Example:**
```json
{
  "workingDirectory": "/my/project",
  "title": "User prefers dark mode interface",
  "content": "The user prefers dark mode interfaces for reduced eye strain.",
  "metadata": {"source": "user_preference"},
  "category": "preferences"
}
```

### `search_memories`
Search memories using text matching across title, content, and category.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `query` (string, required): Search query text (max 1,000 chars)
- `limit` (number, optional): Maximum results (1-100, default: 10)
- `threshold` (number, optional): Relevance threshold (0-1, default: 0.3)
- `category` (string, optional): Filter by category

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

### `get_memory`
Retrieve a specific memory by ID.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Memory ID

**Returns:** Memory object with full details or error if not found

### `list_memories`
List memories with optional filtering.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `category` (string, optional): Filter by category (max 100 chars)
- `limit` (number, optional): Maximum results (1-1000, default: 50)

**Returns:** Array of memories sorted by creation date (newest first)

### `update_memory`
Update an existing memory.

**Parameters:**
- `workingDirectory` (string, required): Project working directory
- `id` (string, required): Memory ID
- `title` (string, optional): Updated title (max 50 chars)
- `content` (string, optional): Updated content
- `metadata` (object, optional): Updated metadata
- `category` (string, optional): Updated category (max 100 chars)

**Returns:** Updated memory object

**Note:** At least one optional parameter must be provided.

### `delete_memory`
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
