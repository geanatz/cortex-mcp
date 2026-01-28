import { z } from 'zod';
import { Storage } from '../../storage/storage.js';
import { Task } from '../../models/task.js';

/**
 * List tasks with hierarchical display, optionally filtered by project and parent
 * Version 2.0: Updated for unified task model supporting unlimited hierarchy
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for listing tasks
 */
export function createListTasksTool(storage: Storage) {
  return {
    name: 'list_tasks',
    description: 'View tasks in hierarchical tree format. Filter by parentId. Use parentId=null for top-level tasks, or specific parentId for subtasks.',
    inputSchema: {
      parentId: z.string().optional(),
      showHierarchy: z.boolean().optional(),
      includeCompleted: z.boolean().optional()
    },
    handler: async ({ parentId, showHierarchy = true, includeCompleted = true }: {
      parentId?: string;
      showHierarchy?: boolean;
      includeCompleted?: boolean;
    }) => {
      try {
        // If parentId is provided, validate parent task exists
        let parentTask = null;
        if (parentId) {
          parentTask = await storage.getTask(parentId);
          if (!parentTask) {
            return {
              content: [{
                type: 'text' as const,
                text: `Error: Parent task with ID "${parentId}" not found.`
              }],
              isError: true
            };
          }
        }

        if (showHierarchy) {
          // Show full hierarchy starting from parentId (or root if not specified)
          const hierarchy = await storage.getTaskHierarchy(parentId);

          if (hierarchy.length === 0) {
            const scopeDescription = parentTask
              ? `under parent task "${parentTask.name}"`
              : `at the top level`;

            return {
              content: [{
                type: 'text' as const,
                text: `No tasks found ${scopeDescription}. Create your first task using create_task.`
              }]
            };
          }

          const formatTaskHierarchy = (hierarchyList: typeof hierarchy, baseLevel: number = 0): string => {
            return hierarchyList.map(item => {
              const task = item.task;

              // Skip completed tasks if not included
              if (!includeCompleted && task.completed) {
                return '';
              }

              const indent = '  '.repeat(baseLevel);
              const icon = task.completed ? '✅' : '⏳';
              const priorityIcon = task.priority && task.priority >= 8 ? '🔥' :
                                 task.priority && task.priority >= 6 ? '⚡' : '';
              const complexityIcon = task.complexity && task.complexity >= 8 ? '🧩' : '';
              const statusText = task.status ? ` [${task.status.toUpperCase()}]` : '';
              const timeText = task.estimatedHours ? ` (${task.estimatedHours}h)` : '';

              let taskLine = `${indent}${icon} **${task.name}** ${priorityIcon}${complexityIcon}${statusText}${timeText}\n`;
              taskLine += `${indent}   ID: ${task.id} | Level: ${task.level || 0}\n`;
              taskLine += `${indent}   ${task.details}\n`;

              if (task.tags && task.tags.length > 0) {
                taskLine += `${indent}   Tags: ${task.tags.join(', ')}\n`;
              }

              if (task.dependsOn && task.dependsOn.length > 0) {
                taskLine += `${indent}   Dependencies: ${task.dependsOn.length} task(s)\n`;
              }

              // Add children recursively
              if (item.children.length > 0) {
                const childrenText = formatTaskHierarchy(item.children, baseLevel + 1);
                if (childrenText.trim()) {
                  taskLine += childrenText;
                }
              }

              return taskLine;
            }).filter(line => line.trim()).join('\n');
          };

          const hierarchyText = formatTaskHierarchy(hierarchy);
          const totalTasks = countTasksInHierarchy(hierarchy);
          const completedTasks = countCompletedTasksInHierarchy(hierarchy);

          const scopeInfo = parentTask
            ? `Showing hierarchy under "${parentTask.name}"`
            : `Showing full task hierarchy`;

          return {
            content: [{
              type: 'text' as const,
              text: `🌲 **Task Hierarchy**

${scopeInfo}
Total: ${totalTasks} tasks (${completedTasks} completed)

${hierarchyText}

💡 **Tips:**
• Use \`create_task\` with parentId to add tasks at any level
• Use \`list_tasks\` with specific parentId to focus on a subtree
• Use \`update_task\` to change parent relationships`
            }]
          };
        } else {
          // Show flat list for specific parent level
          const tasks = await storage.getTasks(parentId);

          if (tasks.length === 0) {
            const scopeDescription = parentTask
              ? `under parent task "${parentTask.name}"`
              : `at the top level`;

            return {
              content: [{
                type: 'text' as const,
                text: `No tasks found ${scopeDescription}. Create your first task using create_task.`
              }]
            };
          }

          const filteredTasks = includeCompleted ? tasks : tasks.filter(t => !t.completed);

          const taskList = filteredTasks.map(task => {
            const icon = task.completed ? '✅' : '⏳';
            const priorityIcon = task.priority && task.priority >= 8 ? '🔥' :
                               task.priority && task.priority >= 6 ? '⚡' : '';
            const complexityIcon = task.complexity && task.complexity >= 8 ? '🧩' : '';
            const statusText = task.status ? ` [${task.status.toUpperCase()}]` : '';
            const timeText = task.estimatedHours ? ` (${task.estimatedHours}h)` : '';

            return `${icon} **${task.name}** ${priorityIcon}${complexityIcon}${statusText}${timeText}
   ID: ${task.id} | Level: ${task.level || 0}
   ${task.details}
   ${task.tags && task.tags.length > 0 ? `Tags: ${task.tags.join(', ')}` : ''}
   Created: ${new Date(task.createdAt).toLocaleString()}`;
          }).join('\n\n');

          const completedCount = filteredTasks.filter(t => t.completed).length;
          const scopeDescription = parentTask
            ? `under "${parentTask.name}"`
            : `at top level`;

          return {
            content: [{
              type: 'text' as const,
              text: `📋 **Tasks ${scopeDescription}**

Found ${filteredTasks.length} task(s) (${completedCount} completed):

${taskList}

💡 Use \`list_tasks\` with \`showHierarchy: true\` to see the full tree structure.`
            }]
          };
        }
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error listing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  };
}

/**
 * Count total tasks in hierarchy
 */
function countTasksInHierarchy(hierarchy: any[]): number {
  return hierarchy.reduce((count, item) => {
    return count + 1 + countTasksInHierarchy(item.children);
  }, 0);
}

/**
 * Count completed tasks in hierarchy
 */
function countCompletedTasksInHierarchy(hierarchy: any[]): number {
  return hierarchy.reduce((count, item) => {
    const thisCount = item.task.completed ? 1 : 0;
    return count + thisCount + countCompletedTasksInHierarchy(item.children);
  }, 0);
}
