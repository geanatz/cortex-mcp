# Agent Memories Feature

The Agent Memories feature provides a comprehensive memory system for AI agents using markdown file storage. It enables persistent storage, text-based search, and CRUD operations for agent memories with simple file-based organization.

## Overview

The agent memories system allows AI agents to:
- Store and retrieve memories with semantic content
- Perform text-based content searches across markdown files
- Organize memories by category
- Maintain persistent storage across sessions with project isolation
- Access rich metadata and timestamps
- Filter and search memories with flexible criteria

## Architecture

The agent memories module follows the same modular architecture as the task management system:

```
src/features/agent-memories/
├── models/           # TypeScript interfaces and types
├── storage/          # Storage interfaces and file implementation
└── tools/           # MCP tool implementations
```

## Data Model

### Memory Interface

```typescript
interface Memory {
  id: string;                    // Unique identifier
  title: string;                 // Short title for file naming (max 50 characters)
  content: string;               // Detailed memory content/text (no limit)
  metadata: Record<string, any>; // Flexible metadata object
  createdAt: string;            // ISO timestamp
  updatedAt: string;            // ISO timestamp
  category?: string;            // Optional categorization
}
```

## Storage

- **Format**: Individual markdown files per memory (YAML frontmatter + body)
- **Location**: `{workingDirectory}/.cortex/memories/{sanitized_title}.md`
- **Organization**: Flat list of markdown files (optional category stored in frontmatter)
- **File Naming**: Uses sanitized memory title (max 50 characters)
- **Schema**: YAML frontmatter with id, title, category, timestamps, metadata + markdown body
- **Search**: Text-based content matching across title and content fields
- **Isolation**: Project-specific storage per working directory
- **Performance**: Fast file system operations with category-based organization
- **Persistence**: All data persists across server restarts

## MCP Tools

### 1. create_memory

Creates a new memory with markdown file storage.

**Parameters:**
- `workingDirectory` (string): Project working directory
- `title` (string): Short title for file naming (max 50 characters)
- `content` (string): Detailed memory content/text (no character limit)
- `metadata` (object, optional): Additional metadata
- `category` (string, optional): Memory category

**Example:**
```json
{
  "workingDirectory": "/path/to/project",
  "title": "User prefers dark mode",
  "content": "The user has explicitly stated they prefer dark mode interfaces over light mode. This preference was mentioned during the UI discussion and should be applied to all future interface recommendations. They find light mode straining on their eyes, especially during evening work sessions.",
  "metadata": {"source": "user_preference", "confidence": 0.9},
  "category": "preferences"
}
```

**Note:** Title is limited to 50 characters for clean file naming. Content has no limit and should contain detailed information.

### 2. search_memories

Searches memories using text content matching across both title and content fields.

**Parameters:**
- `workingDirectory` (string): Project working directory
- `query` (string): Search query text (searches both title and content)
- `limit` (number, optional): Maximum results (default: 10, max: 100)
- `threshold` (number, optional): Relevance threshold (default: 0.3, range: 0-1)
- `category` (string, optional): Filter by category

**Example:**
```json
{
  "workingDirectory": "/path/to/project",
  "query": "user interface preferences",
  "limit": 5,
  "threshold": 0.8,
  "category": "preferences"
}
```

### 3. get_memory

Retrieves a specific memory by ID.

**Parameters:**
- `workingDirectory` (string): Project working directory
- `id` (string): Memory ID

### 4. list_memories

Lists memories with optional filtering.

**Parameters:**
- `workingDirectory` (string): Project working directory
- `category` (string, optional): Filter by category
- `limit` (number, optional): Maximum results (default: 50, max: 1000)

### 5. update_memory

Updates an existing memory.

**Parameters:**
- `workingDirectory` (string): Project working directory
- `id` (string): Memory ID
- `title` (string, optional): Updated title
- `content` (string, optional): Updated content
- `metadata` (object, optional): Updated metadata
- `category` (string, optional): Updated category

### 6. delete_memory

Deletes a memory (requires confirmation).

**Parameters:**
- `workingDirectory` (string): Project working directory
- `id` (string): Memory ID
- `confirm` (boolean): Confirmation flag

## Usage Examples

### Creating a Memory

```javascript
// Create a memory about user preferences
await tools.create_memory({
  workingDirectory: "/my/project",
  title: "User prefers concise technical responses",
  content: "The user has explicitly stated they prefer concise responses with technical explanations. They value brevity but want detailed technical information when relevant. This preference was noted during multiple conversations and should guide response style.",
  metadata: {
    source: "conversation",
    timestamp: "2024-01-15T10:30:00Z"
  },
  category: "user_preferences"
});
```

### Searching Memories

```javascript
// Search for memories about user preferences
const results = await tools.search_memories({
  workingDirectory: "/my/project",
  query: "user preferences responses",
  limit: 5,
  threshold: 0.3,  // Text-based search relevance
  category: "user_preferences"
});
```

## 🔍 **Understanding Text-Based Search**

### **Current Implementation: Multi-Field Text Matching**

✅ **Fast & Reliable**: The system uses intelligent text-based content matching across title, content, and category fields with sophisticated relevance scoring.

#### **How Text Search Works:**
- **Multi-Field Search**: Searches across memory titles, content, and categories
- **Case Insensitive**: Searches are case-insensitive for better usability
- **Intelligent Scoring**: Advanced relevance scoring based on field priority, position, and frequency
- **Category Filtering**: Can filter results by specific categories
- **Fast Performance**: Optimized text matching with immediate results

#### **Search Fields Priority (Highest to Lowest):**
1. **Title** (60% weight) - Most important for relevance
2. **Content** (30% weight) - Secondary importance
3. **Category** (20% bonus) - Additional relevance boost

#### **Key Advantages:**
- **Intelligent Ranking**: Results ranked by true relevance, not just presence
- **Fast Performance**: Instant search results with no processing overhead
- **No Dependencies**: Pure file system operations with no external requirements
- **Predictable Results**: Clear scoring system you can understand and optimize for
- **Easy Debugging**: Transparent relevance scores show why results match

### **🎯 Search Threshold Guide**

#### **Text-Based Search Thresholds**
```javascript
// Recommended thresholds for text-based search
const thresholds = {
  strict: 0.7,       // 70% - High relevance matches
  moderate: 0.3,     // 30% - Good relevance matches (DEFAULT)
  loose: 0.1,        // 10% - Any content matches
};

// Example usage - threshold is optional (defaults to 0.3)
const results = await search_memories({
  query: "user preferences",
  // threshold: 0.3,  // Optional - uses 0.3 default
  limit: 5
});

// Or specify custom threshold
const strictResults = await search_memories({
  query: "user preferences",
  threshold: 0.7,   // Stricter relevance requirement
  limit: 5
});
```

## **🧮 Search Scoring Algorithm**

### **How Relevance Scores Are Calculated**

The system calculates relevance scores using a sophisticated multi-factor algorithm:

#### **1. Title Matches (Highest Priority)**
```javascript
if (titleMatch) {
  titleScore = (1 - firstMatchPosition / titleLength) * 0.6 + (occurrences / 5) * 0.4
  // 60% weight for position + 40% weight for frequency
}
```

**Factors:**
- **Position Weight (60%)**: Earlier matches score higher
- **Frequency Weight (40%)**: More occurrences score higher
- **Maximum Contribution**: Up to 100% of total score

#### **2. Content Matches (Medium Priority)**
```javascript
if (contentMatch) {
  contentScore = (1 - firstMatchPosition / contentLength) * 0.3 + (occurrences / 10) * 0.3
  // 30% weight for position + 30% weight for frequency
}
```

**Factors:**
- **Position Weight (30%)**: Earlier matches score higher
- **Frequency Weight (30%)**: More occurrences score higher (scaled down)
- **Maximum Contribution**: Up to 60% of total score

#### **3. Category Matches (Bonus)**
```javascript
if (categoryMatch) {
  categoryScore = 0.2  // Fixed 20% bonus
}
```

**Factors:**
- **Fixed Bonus**: 20% added to total score
- **No Position/Frequency**: Category is exact match only

#### **4. Final Score Calculation**
```javascript
finalScore = Math.min(titleScore + contentScore + categoryScore, 1.0)
// Capped at 100% maximum
```

### **📊 Score Interpretation Guide**

#### **Expected Relevance Scores:**
- **80-100%**: Excellent match - query appears early in title with high frequency
- **60-79%**: Very good match - strong title match or title + content match
- **40-59%**: Good match - title match at end, or strong content match
- **20-39%**: Moderate match - content match or category bonus
- **10-19%**: Weak match - late content match or low frequency
- **< 10%**: Very weak match - barely meets threshold

#### **Real-World Examples:**

**Query: "user preferences"**
- Title: "User preferences for dark mode" → **~85%** (early title match)
- Title: "Settings and user preferences" → **~65%** (late title match)
- Content: "The user preferences include..." → **~25%** (early content match)
- Category: "user_preferences" → **~20%** (category bonus only)

**Query: "database"**
- Title: "Database configuration" → **~90%** (early title match)
- Title: "PostgreSQL database setup" → **~70%** (mid title match)
- Content: "Configure the database connection..." → **~30%** (early content)
- Content: "...timeout for database operations" → **~15%** (late content)

### **🎯 Optimizing Your Memories for Better Search**

#### **1. Title Optimization (Highest Impact)**
```javascript
// ✅ GOOD: Key terms at the beginning
title: "Database connection configuration"
title: "User prefers dark mode interface"
title: "API rate limiting implementation"

// ❌ AVOID: Key terms at the end
title: "Configuration for database connection"
title: "Interface preferences for user (dark mode)"
title: "Implementation of API rate limiting"
```

#### **2. Content Structure (Medium Impact)**
```javascript
// ✅ GOOD: Important terms early in content
content: "Database connection timeout is set to 30 seconds. This configuration ensures..."

// ❌ LESS OPTIMAL: Important terms buried
content: "This configuration ensures optimal performance. The database connection timeout is set to 30 seconds..."
```

#### **3. Strategic Keyword Repetition**
```javascript
// ✅ GOOD: Natural repetition increases relevance
title: "User authentication system"
content: "The user authentication system implements JWT tokens. User sessions are managed through authentication middleware..."

// ❌ AVOID: Keyword stuffing
title: "Authentication authentication auth system"
```

#### **4. Category Naming Strategy**
```javascript
// ✅ GOOD: Use searchable category names
category: "authentication"  // Searchable
category: "database"        // Searchable
category: "user_interface"  // Searchable

// ❌ LESS OPTIMAL: Generic categories
category: "technical"       // Too broad
category: "misc"           // Not descriptive
category: "stuff"          // Not helpful
```

### Listing Memories

```javascript
// List all memories
const memories = await tools.list_memories({
  workingDirectory: "/my/project",
  limit: 20
});

// List memories by category
const categoryMemories = await tools.list_memories({
  workingDirectory: "/my/project",
  category: "user_preferences",
  limit: 10
});
```

## Best Practices

1. **Title Quality**: Write short, descriptive titles (max 50 chars) for clean file organization
2. **Content Detail**: Use the content field for detailed information without length limits
3. **Categorization**: Use consistent categories to organize memories effectively
4. **Metadata**: Include relevant metadata for better filtering and context
5. **Regular Cleanup**: Periodically review and delete outdated memories
6. **Search Optimization**: Adjust relevance thresholds based on your use case
7. **File Organization**: Keep titles concise but descriptive for readable file structures

## Error Handling

The system provides comprehensive error handling for:
- Invalid input validation
- Database connection issues
- Embedding generation failures
- File system permissions
- Memory not found scenarios

## Troubleshooting

### Common Issues

**"Storage not initialized"**
- Ensure `initialize()` is called before using storage operations
- Check that the working directory exists and is writable

**"Search returns no results"**
- Try different keywords or phrases
- Lower the relevance threshold (try 0.2 or 0.1)
- Verify that the query content matches memory titles or content

**"Memory not found"**
- Verify the memory ID is correct
- Check that the memory wasn't deleted
- Ensure you're using the correct working directory

## Integration

The agent memories feature integrates seamlessly with existing MCP tools and follows the same patterns as the task management system. It can be used alongside task management for comprehensive agent capabilities.

### Integration Examples

```javascript
// Use with task management
await create_memory({
  title: "Current work context",
  content: "Working on a new task in the current project.",
  category: "project_context"
});

// Cross-reference memories with tasks
const memories = await search_memories({
  query: "project requirements",
  category: "project_context"
});
```
