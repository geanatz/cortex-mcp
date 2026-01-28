# Quick Start: Agent Memories

Get started with the Agent Memories feature in just a few minutes!

## Prerequisites

- Node.js 18+ installed
- Cortex MCP Server v3.0.0+
- MCP-compatible client (Claude Desktop, AugmentCode, etc.)

## Installation

```bash
# Install or update to latest version
npx -y @geanatz/cortex-mcp
```

## Basic Usage

### 1. Create Your First Memory

**Important:** Memory titles are limited to 50 characters for clean file organization. Use the content field for detailed information!

```javascript
// Create a memory about user preferences
await create_memory({
  workingDirectory: "/path/to/your/project",
  title: "User prefers concise technical responses", // Max 50 chars
  content: "The user has explicitly stated they prefer concise responses with technical explanations. They value brevity but want detailed technical information when relevant. This preference was noted during multiple conversations and should guide response style.",
  category: "user_preferences",
  metadata: {
    source: "conversation",
    confidence: 0.9
  }
});
```

### 2. Search Memories

```javascript
// Search for memories about user preferences
await search_memories({
  workingDirectory: "/path/to/your/project",
  query: "user preferences responses", // Searches both title and content
  limit: 5,
  threshold: 0.3
});
```

### 3. List All Memories

```javascript
// List all memories
await list_memories({
  workingDirectory: "/path/to/your/project",
  category: "user_preferences", // Optional: filter by category
  limit: 20
});
```

### 4. Update a Memory

```javascript
// Update an existing memory
await update_memory({
  workingDirectory: "/path/to/your/project",
  id: "memory-id-here",
  title: "Updated memory title", // Optional: update title (max 50 chars)
  content: "Updated detailed memory content with comprehensive information about the changes made to this memory entry.", // Optional: update content (no limit)
  category: "updated_category" // Optional: update category
});
```

### 5. Delete a Memory

```javascript
// Delete a memory (requires confirmation)
await delete_memory({
  workingDirectory: "/path/to/your/project",
  id: "memory-id-here",
  confirm: true
});
```

## Common Use Cases

### User Preferences
```javascript
await create_memory({
  workingDirectory: "/my/project",
  title: "User prefers dark mode and minimal UI",
  content: "The user has explicitly stated they prefer dark mode interfaces and minimal UI design. They find light themes straining on their eyes and prefer clean, uncluttered interfaces with essential elements only.",
  category: "preferences",
  metadata: { ui_theme: "dark", design_style: "minimal" }
});
```

### Project Context
```javascript
await create_memory({
  workingDirectory: "/my/project",
  title: "React TypeScript project with strict ESLint",
  content: "This project is built using React with TypeScript for type safety. The codebase follows strict ESLint rules including no-any, prefer-const, and custom rules for component structure. All components must be functional with proper TypeScript interfaces.",
  category: "technical",
  metadata: { framework: "React", language: "TypeScript", linting: "strict" }
});
```

### Conversation History
```javascript
await create_memory({
  workingDirectory: "/my/project",
  title: "User works in healthcare, needs HIPAA compliance",
  content: "The user mentioned they work in the healthcare industry and their applications must be HIPAA compliant. This affects data handling, storage, encryption requirements, and audit logging. All patient data must be encrypted at rest and in transit.",
  category: "context",
  metadata: { industry: "healthcare", compliance: "HIPAA", severity: "critical" }
});
```

## Search Examples

### Text-Based Search with Scoring
```javascript
// Find memories related to user interface (searches title, content, and category)
const results = await search_memories({
  workingDirectory: "/my/project",
  query: "user interface design preferences",
  threshold: 0.3  // Default threshold (30% relevance minimum)
});

// Results are ranked by relevance score:
// - 80-100%: Excellent match (query in title, early position)
// - 60-79%:  Very good match (strong title or title+content match)
// - 40-59%:  Good match (title at end or strong content match)
// - 20-39%:  Moderate match (content match or category bonus)
// - 10-19%:  Weak match (late content match)
```

### Filtered Search
```javascript
// Search within a specific category
const results = await search_memories({
  workingDirectory: "/my/project",
  query: "coding standards",
  category: "technical",
  threshold: 0.3
});
```

### Understanding Search Results
```javascript
// Example search result with scoring explanation:
{
  "relevanceScore": "68.5%",
  "memory": {
    "title": "User interface design preferences",  // ← High score: exact match in title
    "content": "The user prefers clean, minimal interface designs...",
    "category": "preferences"
  }
}

// Why this scored 68.5%:
// - Title match: "user interface" appears early in title (≈50% contribution)
// - Content match: "design preferences" in content (≈15% contribution)
// - Category bonus: Not applicable (≈0% contribution)
// - Total: ≈65% + position/frequency bonuses = 68.5%
```

## Tips for Better Results

### 1. Write Clear Titles and Content
```javascript
// Good: Descriptive title and detailed content
title: "User prefers TypeScript over JavaScript"
content: "The user has expressed a strong preference for TypeScript over JavaScript due to better type safety, improved IDE support, and reduced runtime errors. They particularly value the compile-time error checking."

// Avoid: Vague or unclear
title: "User likes TS"
content: "TS good"
```

### 2. Use Consistent Categories
```javascript
// Recommended categories:
- "preferences"     // User preferences and settings
- "technical"       // Technical requirements and constraints
- "context"         // Conversation context and background
- "project"         // Project-specific information
- "personal"        // Personal information about the user
```

### 3. Keep Titles Concise but Searchable
```javascript
// Good: Under 50 characters, key terms first
title: "Database PostgreSQL connection pooling setup"
title: "User authentication JWT implementation"
title: "API rate limiting Redis configuration"

// Avoid: Too long (over 50 characters)
title: "The project database configuration uses PostgreSQL version 14.2 with connection pooling enabled for better performance"

// Avoid: Key terms at the end (lower search scores)
title: "Configuration and setup for PostgreSQL database"
title: "Implementation details for user authentication"
```

### 4. Optimize for Search Relevance
```javascript
// ✅ HIGH SEARCH SCORE: Key terms early in title
title: "Redis caching implementation"
content: "Redis caching system configured for session storage..."

// ✅ MEDIUM SEARCH SCORE: Key terms in content
title: "Session storage configuration"
content: "Redis caching system handles all session data..."

// ❌ LOW SEARCH SCORE: Key terms buried or missing
title: "System configuration notes"
content: "Various settings have been configured including Redis for sessions..."
```

### 5. Include Useful Metadata
```javascript
metadata: {
  source: "conversation",      // Where this memory came from
  confidence: 0.9,            // How confident you are (0-1)
  timestamp: "2024-01-15",    // When this was relevant
  tags: ["ui", "design"]      // Additional tags for organization
}
```

## Storage Location

Memories are stored in your project directory:
```
your-project/
├── .cortex/
│   ├── tasks/              # Task management data
│   │   ├── 001-design-mockups/
│   │   │   └── task.json
│   │   └── 002-create-wireframes/
│   │       └── task.json
│   └── memories/           # Markdown file storage
│       ├── user-prefers-dark-mode-and-minimal-ui.md
│       ├── react-typescript-project-with-strict-eslint.md
│       └── user-works-in-healthcare-needs-hipaa-compliance.md
├── src/
└── package.json
```

## Next Steps

1. **Read the Full Documentation**: Check out `docs/AGENT_MEMORIES.md` for complete details
2. **Experiment with Search**: Try different search terms to find what works best
3. **Organize with Categories**: Develop a consistent categorization system
4. **Use with Tasks**: Combine memories with task management for comprehensive project context
5. **Monitor Performance**: Use the statistics features to understand your memory usage

## Need Help?

- 📖 Full documentation: `docs/AGENT_MEMORIES.md`
- 🐛 Report issues: GitHub issue tracker
- 💡 Feature requests: GitHub discussions
- 📋 Version history: `CHANGELOG.md`

Happy memory management! 🧠✨
