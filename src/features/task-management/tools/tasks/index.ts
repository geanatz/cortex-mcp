import { Storage } from '../../storage/storage.js';
import { createCreateTaskTool } from './create.js';
import { createDeleteTaskTool } from './delete.js';
import { createGetTaskTool } from './get.js';
import { createListTasksTool } from './list.js';
import { createMoveTaskTool } from './move.js';
import { createUpdateTaskTool } from './update.js';

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
