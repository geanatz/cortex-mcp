import { z } from 'zod';
import { Storage } from '../../storage/storage.js';
import { Task, TaskHierarchy } from '../../models/task.js';

/**
 * List tasks with hierarchical display, optionally filtered by parent
 * ID=folder name, no name/priority/complexity fields
 *
 * @param storage - Storage instance
 * @returns MCP tool handler for listing tasks
 */
export function createListTasksTool(storage: Storage) {
  return {
    name: 'list_tasks',
    description: 'View tasks in hierarchical tree format. Filter by parentId. Use parentId=null for top-level tasks, or specific parentId for subtasks. Use includeDone=false to hide done tasks.',
    inputSchema: {
      parentId: z.string().optional(),
      showHierarchy: z.boolean().optional(),
      includeDone: z.boolean().optional()
    },
    handler: async ({ parentId, showHierarchy = true, includeDone = true }: {
      parentId?: string;
      showHierarchy?: boolean;
      includeDone?: boolean;
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
              ? `under parent task "${parentTask.id}"`
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

              // Skip done tasks if not included
              if (!includeDone && task.status === 'done') {
                return '';
              }

              const indent = '  '.repeat(baseLevel);
              const icon = task.status === 'done' ? '✅' : '⏳';
              const statusText = task.status ? ` [${task.status.toUpperCase()}]` : '';

              let taskLine = `${indent}${icon} **${task.id}**${statusText}\n`;
              taskLine += `${indent}   Level: ${task.level || 0}\n`;
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
          const doneTasks = countDoneTasksInHierarchy(hierarchy);

          const scopeInfo = parentTask
            ? `Showing hierarchy under "${parentTask.id}"`
            : `Showing full task hierarchy`;

          return {
            content: [{
              type: 'text' as const,
              text: `🌲 **Task Hierarchy**

${scopeInfo}
 Total: ${totalTasks} tasks (${doneTasks} done)

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
              ? `under parent task "${parentTask.id}"`
              : `at the top level`;

            return {
              content: [{
                type: 'text' as const,
                text: `No tasks found ${scopeDescription}. Create your first task using create_task.`
              }]
            };
          }

          const filteredTasks = includeDone ? tasks : tasks.filter(t => t.status !== 'done');

          const taskList = filteredTasks.map(task => {
            const icon = task.status === 'done' ? '✅' : '⏳';
            const statusText = task.status ? ` [${task.status.toUpperCase()}]` : '';

            return `${icon} **${task.id}**${statusText}
   Level: ${task.level || 0}
   ${task.details}
   ${task.tags && task.tags.length > 0 ? `Tags: ${task.tags.join(', ')}` : ''}
   Created: ${new Date(task.createdAt).toLocaleString()}`;
          }).join('\n\n');

          const doneCount = filteredTasks.filter(t => t.status === 'done').length;
          const scopeDescription = parentTask
            ? `under "${parentTask.id}"`
            : `at top level`;

          return {
            content: [{
              type: 'text' as const,
              text: `📋 **Tasks ${scopeDescription}**

 Found ${filteredTasks.length} task(s) (${doneCount} done):

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
function countTasksInHierarchy(hierarchy: readonly TaskHierarchy[]): number {
  return hierarchy.reduce((count, item) => {
    return count + 1 + countTasksInHierarchy(item.children);
  }, 0);
}

/**
 * Count done tasks in hierarchy
 */
function countDoneTasksInHierarchy(hierarchy: readonly TaskHierarchy[]): number {
  return hierarchy.reduce((count, item) => {
    const thisCount = item.task.status === 'done' ? 1 : 0;
    return count + thisCount + countDoneTasksInHierarchy(item.children);
  }, 0);
}
