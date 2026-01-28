# Changelog

All notable changes to this project will be documented in this file.

## [3.0.0] - 2026-01-27

### 🏗️ Major Architecture Refactor: File-Based Storage

This major release introduces a completely refactored storage architecture following MCP best practices for 2025-2026.

### ⚠️ Breaking Changes

The storage format has changed. New installations will use the new architecture:
- Tasks stored in `.cortex/tasks/{number}-{slug}/task.json`
- Memories stored in `.cortex/memories/{title}.md`

### Changed

#### 🗂️ New Storage Architecture
```
.cortex/
├── tasks/
│   ├── 001-implement-auth/
│   │   └── task.json
│   └── 002-add-tests/
│       └── task.json
└── memories/
    ├── user-prefers-dark-mode.md
    └── project-uses-typescript.md
```

#### 🔧 Technical Improvements
- **Atomic Writes**: File operations use temp files with rename for POSIX-atomic writes
- **Cascade Delete**: Deleting a task automatically removes all associated child tasks
- **Consistent Architecture**: Task storage follows the same file-based pattern as memories

### Added

#### 🎯 Enhanced Storage Interface
- `getVersion()` method for configuration version info
- `initialize()` method now part of the interface contract

### Technical Details

#### 📁 File Locations
- Tasks: `{workingDirectory}/.cortex/tasks/{id}/task.json`
- Memories: `{workingDirectory}/.cortex/memories/{title}.md`

---

## [2.0.0] - 2025-06-20

### 🔧 Task Hierarchy Improvements

### Added

#### 🚀 Hierarchy Tools
- **`move_task`**: Tool for moving tasks within unlimited hierarchy structure
- **Enhanced `create_task`**: Added `parentId` parameter for unlimited nesting depth
- **Enhanced `update_task`**: Added `parentId` parameter for hierarchy reorganization

### Technical Details

#### 🏗️ Hierarchy Features
- **Hierarchy Movement**: `move_task` enables flexible task reorganization across unlimited depth
- **Nested Task Creation**: `create_task` supports unlimited hierarchy with `parentId` parameter
- **Task Reorganization**: `update_task` allows moving tasks between hierarchy levels

---

## [1.8.0] - 2025-06-19

### 🚀 MAJOR: Unified Task Model with Unlimited Hierarchy Depth

This release introduces a **revolutionary unified task model** that replaces the previous 3-level hierarchy (Project → Task → Subtask) with a single Task model supporting **unlimited nesting depth**. This architectural transformation enables infinite task hierarchies while maintaining full backward compatibility and enhanced features at every level.

### Added

#### ✨ Unlimited Task Hierarchy
- **Single Task Model**: Unified `Task` interface replaces separate task/subtask types
- **Unlimited Depth**: Tasks can be nested infinitely deep (tasks → subtasks → deeper levels)
- **Parent-Child Relationships**: New `parentId` field enables flexible hierarchy organization
- **Level Tracking**: Automatic `level` calculation for visual hierarchy indicators
- **Rich Features at All Levels**: Every task gets full metadata (dependencies, tags, status, time tracking)

#### 🔄 Automatic Migration System
- **Seamless Upgrade**: Existing subtasks automatically converted to tasks with `parentId`
- **Data Preservation**: All existing task and subtask data fully preserved during migration
- **Migration Status**: Built-in migration tracking and validation
- **Backward Compatibility**: Old 3-level structure seamlessly transitions to unlimited depth
- **Production Safe**: Migration runs automatically on startup with comprehensive error handling

#### 🌲 Enhanced Hierarchical Display
- **Tree Visualization**: Comprehensive hierarchical tree display with unlimited depth support
- **Level Indicators**: Visual indentation and level markers (Level 0, 1, 2, etc.)
- **Hierarchy Navigation**: Navigate and filter tasks at any hierarchy level
- **Path Information**: Clear parent-child relationship visibility
- **Collapsible Tree**: Expandable/collapsible tree structure for better organization

#### 🛠️ New Unified Tools
- **`move_task`**: Dedicated tool for moving tasks within hierarchy (change parent relationships)
- **`migrate_subtasks`**: Manual migration tool for legacy subtask conversion
- **Enhanced `create_task`**: Now supports `parentId` for creating tasks at any hierarchy level
- **Enhanced `list_tasks`**: Complete rewrite with unlimited depth tree display and hierarchy navigation
- **Enhanced `update_task`**: Added `parentId` support for moving tasks within hierarchy

### Enhanced

#### 🎯 Task Model v2.0
```typescript
interface Task {
  // Core fields (unchanged)
  id: string;
  details: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;

  // Enhanced hierarchy fields (NEW)
  parentId?: string;           // Parent task ID for unlimited nesting
  level?: number;              // Computed hierarchy level (0, 1, 2, etc.)

  // Rich metadata (from v1.7.0)
  dependsOn?: string[];
  status?: 'pending' | 'in-progress' | 'blocked' | 'done';
  tags?: string[];
  actualHours?: number;
}
```

#### 📊 Storage Layer Enhancements
- **Hierarchy Methods**: New storage methods for unlimited depth operations
  - `getTaskHierarchy(parentId?)`: Get complete hierarchy tree
  - `getTaskChildren(taskId)`: Get direct children of a task
  - `getTaskAncestors(taskId)`: Get full ancestor path
  - `deleteTasksByParent(parentId)`: Recursive deletion of child tasks
- **Migration Support**: Built-in migration system with status tracking
- **Validation**: Circular reference detection and parent-child validation
- **Performance**: Optimized for hierarchical queries and tree operations

#### 🎨 Visual Hierarchy Improvements
- **Level-Based Display**: Different visual indicators for each hierarchy level
- **Indented Tree Structure**: Clear visual nesting with proper indentation
- **Status Inheritance**: Visual inheritance patterns from parent to child tasks
- **Hierarchy Breadcrumbs**: Clear path navigation through task hierarchies
- **Collapsible Sections**: Expandable tree structure for large hierarchies

### Changed

#### 🔄 Tool Interface Updates
- **`list_tasks`**: Complete rewrite with hierarchical tree display and unlimited depth visualization
- **`create_task`**: Added optional `parentId` parameter for creating nested tasks
- **`update_task`**: Added `parentId` support for moving tasks between hierarchy levels
- **Legacy Subtask Tools**: All subtask tools now work with unified Task model
- **Enhanced Descriptions**: Updated tool descriptions to reflect unlimited hierarchy capabilities

#### 📈 Enhanced Guidance & Agent Integration
- **Intelligent Agent Responses**: Updated agent guidance to utilize unlimited hierarchy
- **Hierarchy-Aware Recommendations**: Task recommendations consider hierarchy relationships

### Migration & Compatibility

#### ✅ Seamless Backward Compatibility
- **Zero Breaking Changes**: All existing functionality preserved
- **Automatic Migration**: Subtasks transparently converted to nested tasks
- **Data Integrity**: All task relationships and metadata preserved
- **Tool Compatibility**: All existing tool calls continue to work
- **API Stability**: No changes to external MCP tool interfaces

#### 🎯 Migration Features
- **Automatic Detection**: Identifies legacy subtasks on startup
- **Safe Conversion**: Preserves all data during subtask-to-task conversion
- **Migration Logging**: Comprehensive logging of migration process
- **Rollback Safety**: Migration preserves original data structure references
- **Status Reporting**: Clear migration status and completion confirmation

#### 🔧 Gradual Adoption
- **Mixed Mode Support**: Legacy subtasks and new unlimited hierarchy work together
- **Progressive Enhancement**: Can adopt unlimited depth features gradually
- **VS Code Extension**: Companion extension updated for unlimited hierarchy support
- **Tool Learning**: Enhanced tool descriptions guide users through new capabilities

### Technical Architecture

#### 🏗️ Core Implementation
- **Unified Model**: Single Task interface handles all hierarchy levels
- **Parent-Child Indexing**: Efficient parentId-based relationship tracking
- **Level Calculation**: Automatic hierarchy level computation and caching
- **Circular Prevention**: Robust validation prevents circular parent-child relationships
- **Performance Optimization**: Efficient tree traversal and hierarchy queries

#### 📊 Storage Enhancements
- **Tree Operations**: Optimized methods for hierarchy manipulation
- **Batch Processing**: Efficient bulk operations for large hierarchies
- **Relationship Integrity**: Automatic validation of parent-child relationships
- **Migration Engine**: Robust system for data model transitions
- **Index Management**: Efficient indexing for hierarchical queries

### Use Cases & Benefits

#### 🎯 Unlimited Workflow Flexibility
- **Epic → Feature → Story → Task**: Agile development with unlimited breakdown
- **Project → Phase → Milestone → Deliverable**: Project management hierarchies
- **Goal → Objective → Strategy → Action**: Strategic planning structures
- **Research → Topic → Question → Investigation**: Academic and research workflows

#### 🤖 Enhanced AI Agent Capabilities
- **Recursive Task Breakdown**: AI can break down complex tasks to any depth
- **Hierarchical Context**: Agents understand task relationships at all levels
- **Smart Navigation**: Intelligent task traversal through unlimited hierarchies
- **Context-Aware Actions**: AI actions consider full hierarchical context

#### 👥 Improved Human-AI Collaboration
- **Flexible Organization**: Organize work exactly as needed without depth limitations
- **Visual Clarity**: Clear tree visualization of complex project structures
- **Enhanced Planning**: Plan projects with natural hierarchical breakdown
- **Better Tracking**: Track progress at any granularity level

---

## [1.7.0] - 2025-06-04

### 🚀 MAJOR: Advanced Task Management & AI Agent Tools

This release transforms the MCP server into a comprehensive task management platform with advanced AI agent capabilities, enhanced task metadata, and intelligent workflow tools.

### Added

#### 🎯 Enhanced Task Model with Rich Metadata
- **Task Dependencies**: `dependsOn` field for task dependency management with validation
- **Enhanced Status Workflow**: `pending` → `in-progress` → `blocked` → `done` status tracking
- **Tag-Based Organization**: Flexible categorization and filtering system
- **Time Tracking**: `actualHours` for project planning and reporting
- **Backward Compatibility**: All new fields are optional, existing tasks continue to work

#### 🔧 Enhanced Task Management Tools
- **`create_task`**: Now supports enhanced metadata fields (dependencies, status, tags, time tracking)
- **`update_task`**: Enhanced to handle metadata fields including dependency updates
- **Dependency Validation**: Automatic validation of task dependencies during creation and updates
