import { Storage } from '../../storage/storage.js';
import { createCreateTaskTool } from './create.js';
import { createDeleteTaskTool } from './delete.js';
import { createGetTaskTool } from './get.js';
import { createListTasksTool } from './list.js';
import { createUpdateTaskTool } from './update.js';

/**
 * Tool for moving tasks within the hierarchy
 * Version 5.0: Simplified - ID=folder name, no name field
 */
function createMoveTaskTool(storage: Storage) {
  return {
    name: 'move_task',
    description: 'Move a task to a different parent in the hierarchy. Set newParentId to move under another task, or leave empty to move to top level. Supports unlimited nesting depth.',
    inputSchema: {
      taskId: { type: 'string' },
      newParentId: { type: 'string', optional: true }
    },
    handler: async ({ taskId, newParentId }: { taskId: string; newParentId?: string }) => {
      try {
        if (!taskId || taskId.trim().length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Task ID is required.'
            }],
            isError: true
          };
        }

        const task = await storage.getTask(taskId.trim());
        if (!task) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Task with ID "${taskId}" not found. Use list_tasks to see available tasks.`
            }],
            isError: true
          };
        }

        const oldParent = task.parentId ? await storage.getTask(task.parentId) : null;
        const newParent = newParentId ? await storage.getTask(newParentId.trim()) : null;

        // Validate new parent if specified
        if (newParentId && !newParent) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: New parent task with ID "${newParentId}" not found.`
            }],
            isError: true
          };
        }

        const movedTask = await storage.moveTask(taskId.trim(), newParentId?.trim());
        if (!movedTask) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Failed to move task with ID "${taskId}".`
            }],
            isError: true
          };
        }

        // Build path information
        const ancestors = await storage.getTaskAncestors(movedTask.id);

        const oldPath = oldParent
          ? `${oldParent.id} → ${task.id}`
          : task.id;

        const newPath = newParent
          ? `${ancestors.map(a => a.id).join(' → ')} → ${movedTask.id}`
          : movedTask.id;

        const levelIndicator = '  '.repeat(movedTask.level || 0) + '→';

        return {
          content: [{
            type: 'text' as const,
            text: `✅ **Task Moved Successfully!**

**${levelIndicator} ${movedTask.id}**

📍 **Movement Summary:**
• From: ${oldPath}
• To: ${newPath}
• New Level: ${movedTask.level || 0} ${(movedTask.level || 0) === 0 ? '(Top-level)' : `(${movedTask.level} level${(movedTask.level || 0) > 1 ? 's' : ''} deep)`}
• New Parent: ${newParent ? `${newParent.id}` : 'None (Top-level)'}

🎯 **Next Steps:**
• Use \`list_tasks\` with \`showHierarchy: true\` to see the updated structure
• Continue organizing with \`move_task\` or \`update_task\`
• Add more nested tasks with \`create_task\` using parentId`
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error moving task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  };
}

/**
 * Create all task-related tools
 * Version 5.0: Simplified task model
 */
export function createTaskTools(storage: Storage) {
  return {
    create_task: createCreateTaskTool(storage),
    delete_task: createDeleteTaskTool(storage),
    get_task: createGetTaskTool(storage),
    list_tasks: createListTasksTool(storage),
    update_task: createUpdateTaskTool(storage),
    move_task: createMoveTaskTool(storage)
  };
}
