import { z } from 'zod';
import { Task } from '../../models/task.js';
import { Storage } from '../../storage/storage.js';
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';

/**
 * Infer task completion status by analyzing the codebase for implementation evidence
 * This tool implements intelligent progress inference from code analysis
 */
export function createProgressInferenceTool(storage: Storage, getWorkingDirectoryDescription: (config: any) => string, config: any) {
  return {
    name: 'infer_task_progress',
    description: 'Analyze the codebase to infer which tasks appear to be completed based on code changes, file creation, and implementation evidence. Intelligent progress inference feature for automatic task completion tracking.',
    inputSchema: z.object({
      workingDirectory: z.string().describe(getWorkingDirectoryDescription(config)),
      scanDepth: z.number().min(1).max(5).optional().default(3).describe('Directory depth to scan for code files'),
      fileExtensions: z.array(z.string()).optional().default(['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.go', '.rs']).describe('File extensions to analyze'),
      autoUpdateTasks: z.boolean().optional().default(false).describe('Whether to automatically update task status based on inference'),
      confidenceThreshold: z.number().min(0).max(1).optional().default(0.7).describe('Confidence threshold for auto-updating tasks (0-1)')
    }),
    handler: async (args: any) => {
      try {
        const {
          workingDirectory,
          scanDepth,
          fileExtensions,
          autoUpdateTasks,
          confidenceThreshold
        } = args;

        // Get tasks to analyze
        const tasksToAnalyze = await storage.getTasks();

        // Filter out already completed tasks
        const incompleteTasks = tasksToAnalyze.filter(task =>
          !task.completed && task.status !== 'done'
        );

        if (incompleteTasks.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `No incomplete tasks found.`
            }]
          };
        }

        // Scan codebase
        const codebaseFiles = await scanCodebase(workingDirectory, scanDepth, fileExtensions);

        // Analyze each task for completion evidence
        const analysisResults = await analyzeTaskCompletion(
          incompleteTasks,
          codebaseFiles,
          workingDirectory
        );

        // Auto-update tasks if requested
        let updatedTasks: Task[] = [];
        if (autoUpdateTasks) {
          updatedTasks = await autoUpdateTaskStatus(
            storage,
            analysisResults,
            confidenceThreshold
          );
        }

        // Generate progress inference report
        const report = generateProgressInferenceReport(
          analysisResults,
          updatedTasks,
          autoUpdateTasks,
          confidenceThreshold
        );

        return {
          content: [{
            type: 'text' as const,
            text: report
          }]
        };

      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error inferring task progress: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    }
  };
}

interface CodebaseFile {
  path: string;
  content: string;
  lastModified: Date;
  size: number;
}

interface TaskAnalysisResult {
  task: Task;
  confidence: number;
  evidence: string[];
  suggestedStatus: 'pending' | 'in-progress' | 'done';
  reasoning: string;
}

/**
 * Scan codebase for relevant files
 */
async function scanCodebase(
  workingDirectory: string,
  maxDepth: number,
  extensions: string[]
): Promise<CodebaseFile[]> {
  const files: CodebaseFile[] = [];

  async function scanDirectory(dirPath: string, currentDepth: number): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        // Skip common directories to ignore
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
            await scanDirectory(fullPath, currentDepth + 1);
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (extensions.includes(ext)) {
            try {
              const stats = await stat(fullPath);
              const content = await readFile(fullPath, 'utf-8');

              files.push({
                path: fullPath.replace(workingDirectory, '').replace(/^[\/\\]/, ''),
                content,
                lastModified: stats.mtime,
                size: stats.size
              });
            } catch (error) {
              // Skip files that can't be read
              continue;
            }
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be read
      return;
    }
  }

  await scanDirectory(workingDirectory, 0);
  return files;
}

/**
 * Analyze tasks for completion evidence in codebase
 */
async function analyzeTaskCompletion(
  tasks: Task[],
  codebaseFiles: CodebaseFile[],
  workingDirectory: string
): Promise<TaskAnalysisResult[]> {

  const results: TaskAnalysisResult[] = [];

  for (const task of tasks) {
    const analysis = analyzeTaskEvidence(task, codebaseFiles);
    results.push(analysis);
  }

  return results;
}

/**
 * Analyze evidence for a specific task
 */
function analyzeTaskEvidence(task: Task, codebaseFiles: CodebaseFile[]): TaskAnalysisResult {
  const evidence: string[] = [];
  let confidence = 0;

  // Extract keywords from task name and details
  const taskKeywords = extractTaskKeywords(task);

  // Analyze each file for task-related content
  for (const file of codebaseFiles) {
    const fileEvidence = analyzeFileForTask(file, taskKeywords, task);
    evidence.push(...fileEvidence.evidence);
    confidence += fileEvidence.confidence;
  }

  // Normalize confidence (0-1 scale)
  confidence = Math.min(1, confidence / 10);

  // Determine suggested status
  let suggestedStatus: 'pending' | 'in-progress' | 'done' = 'pending';
  if (confidence >= 0.8) {
    suggestedStatus = 'done';
  } else if (confidence >= 0.4) {
    suggestedStatus = 'in-progress';
  }

  // Generate reasoning
  const reasoning = generateTaskReasoning(task, evidence, confidence, suggestedStatus);

  return {
    task,
    confidence,
    evidence,
    suggestedStatus,
    reasoning
  };
}

/**
 * Extract relevant keywords from task
 */
function extractTaskKeywords(task: Task): string[] {
  const text = (task.name + ' ' + task.details).toLowerCase();
  const keywords: string[] = [];

  // Extract nouns and important terms
  const words = text.split(/\s+/);
  for (const word of words) {
    if (word.length > 3 && !['the', 'and', 'for', 'with', 'this', 'that', 'from', 'they', 'have', 'will'].includes(word)) {
      keywords.push(word);
    }
  }

  // Add task tags
  if (task.tags) {
    keywords.push(...task.tags);
  }

  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Analyze a file for task-related evidence
 */
function analyzeFileForTask(
  file: CodebaseFile,
  taskKeywords: string[],
  task: Task
): { evidence: string[]; confidence: number } {

  const evidence: string[] = [];
  let confidence = 0;
  const content = file.content.toLowerCase();

  // Check for keyword matches
  const keywordMatches = taskKeywords.filter(keyword =>
    content.includes(keyword)
  );

  if (keywordMatches.length > 0) {
    evidence.push(`File ${file.path} contains ${keywordMatches.length} task-related keywords: ${keywordMatches.slice(0, 3).join(', ')}`);
    confidence += keywordMatches.length * 0.5;
  }

  // Check for implementation patterns
  const implementationPatterns = [
    /function\s+\w*${taskKeywords.join('|')}\w*/gi,
    /class\s+\w*${taskKeywords.join('|')}\w*/gi,
    /const\s+\w*${taskKeywords.join('|')}\w*/gi,
    /export\s+.*${taskKeywords.join('|')}/gi
  ];

  for (const pattern of implementationPatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      evidence.push(`File ${file.path} contains implementation patterns: ${matches.slice(0, 2).join(', ')}`);
      confidence += matches.length * 1.0;
    }
  }

  // Check for test files
  if (file.path.includes('test') || file.path.includes('spec')) {
    const testMatches = taskKeywords.filter(keyword => content.includes(keyword));
    if (testMatches.length > 0) {
      evidence.push(`Test file ${file.path} contains task-related tests`);
      confidence += 2.0; // Tests are strong evidence of completion
    }
  }

  // Check file modification time (recent changes suggest active work)
  const daysSinceModified = (Date.now() - file.lastModified.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceModified < 7 && keywordMatches.length > 0) {
    evidence.push(`File ${file.path} was recently modified (${Math.round(daysSinceModified)} days ago)`);
    confidence += 1.0;
  }

  return { evidence, confidence };
}

/**
 * Generate reasoning for task analysis
 */
function generateTaskReasoning(
  task: Task,
  evidence: string[],
  confidence: number,
  suggestedStatus: string
): string {
  if (evidence.length === 0) {
    return `No evidence found in codebase for task "${task.name}". Task appears not started.`;
  }

  const confidencePercent = Math.round(confidence * 100);

  return `Analysis of task "${task.name}" shows ${confidencePercent}% confidence of ${suggestedStatus} status. Evidence: ${evidence.slice(0, 3).join('; ')}${evidence.length > 3 ? ` and ${evidence.length - 3} more indicators` : ''}.`;
}

/**
 * Auto-update task status based on analysis
 */
async function autoUpdateTaskStatus(
  storage: Storage,
  analysisResults: TaskAnalysisResult[],
  threshold: number
): Promise<Task[]> {

  const updatedTasks: Task[] = [];

  for (const result of analysisResults) {
    if (result.confidence >= threshold && result.suggestedStatus !== 'pending') {
      try {
        const updates: any = {
          status: result.suggestedStatus
        };

        if (result.suggestedStatus === 'done') {
          updates.completed = true;
        }

        const updatedTask = await storage.updateTask(result.task.id, updates);
        if (updatedTask) {
          updatedTasks.push(updatedTask);
        }
      } catch (error) {
        // Continue with other tasks if one fails
        continue;
      }
    }
  }

  return updatedTasks;
}

/**
 * Generate progress inference report
 */
function generateProgressInferenceReport(
  analysisResults: TaskAnalysisResult[],
  updatedTasks: Task[],
  autoUpdated: boolean,
  threshold: number
): string {
  let report = `🔍 **Task Progress Inference Report**

📊 **Analysis Summary:**
• Tasks analyzed: ${analysisResults.length}
• High confidence completions: ${analysisResults.filter(r => r.confidence >= 0.8).length}
• Likely in-progress: ${analysisResults.filter(r => r.confidence >= 0.4 && r.confidence < 0.8).length}
• No evidence found: ${analysisResults.filter(r => r.confidence < 0.4).length}

`;

  if (autoUpdated && updatedTasks.length > 0) {
    report += `✅ **Auto-updated ${updatedTasks.length} tasks** based on codebase analysis (confidence ≥${Math.round(threshold * 100)}%)

`;
  }

  // Group results by confidence level
  const highConfidence = analysisResults.filter(r => r.confidence >= 0.8);
  const mediumConfidence = analysisResults.filter(r => r.confidence >= 0.4 && r.confidence < 0.8);
  const lowConfidence = analysisResults.filter(r => r.confidence < 0.4);

  if (highConfidence.length > 0) {
    report += `🎯 **High Confidence Completions (≥80%):**
${highConfidence.map(r =>
  `• **${r.task.name}** (${Math.round(r.confidence * 100)}% confidence)
  Status: ${r.suggestedStatus} ${autoUpdated && updatedTasks.some(t => t.id === r.task.id) ? '✅ Updated' : ''}
  ${r.reasoning}`
).join('\n\n')}

`;
  }

  if (mediumConfidence.length > 0) {
    report += `🔄 **Likely In Progress (40-79%):**
${mediumConfidence.map(r =>
  `• **${r.task.name}** (${Math.round(r.confidence * 100)}% confidence)
  ${r.reasoning}`
).join('\n\n')}

`;
  }

  if (lowConfidence.length > 0) {
    report += `❓ **No Clear Evidence (<40%):**
${lowConfidence.slice(0, 5).map(r =>
  `• **${r.task.name}** (${Math.round(r.confidence * 100)}% confidence)`
).join('\n')}${lowConfidence.length > 5 ? `\n... and ${lowConfidence.length - 5} more` : ''}

`;
  }

  // Determine a relevant projectId for examples, if possible
  const exampleProjectId = "current_project";

  let new_guidance = "\n👉 **Your Actions: Verify Progress and Update Tasks**\n\n";

  new_guidance += "1.  **Verify and Update Completed Tasks:** For tasks reported with high confidence of completion (especially if not auto-updated), verify their status. If correct, use the \`update_task\` tool to mark them as 'done' and 'completed: true'.\n"
  new_guidance += "    *   Example: \`update_task({ id: \"task_id_from_report\", status: \"done\", completed: true })\`\n\n";

  new_guidance += "2.  **Check In-Progress Tasks:** For tasks identified as 'Likely In Progress', confirm their current status. If they are indeed being worked on, ensure their status is 'in-progress' using \`update_task\`.\n"
  new_guidance += "    *   Example: \`update_task({ id: \"task_id_from_report\", status: \"in-progress\" })\`\n\n";

  new_guidance += "3.  **Address Tasks with No Clear Evidence:** For tasks where no clear evidence was found, consider if they have started or if their descriptions need more keywords for better future detection. If they are blocked, update their status accordingly.\n"
  new_guidance += "    *   Example: \`update_task({ id: \"task_id_from_report\", status: \"blocked\", details: \"New details with more keywords...\" })\`\n\n";

  new_guidance += "4.  **Run Analysis Regularly:** To keep track of progress automatically, run this \`infer_task_progress\` tool periodically.\n\n";

  new_guidance += "5.  **Determine Next Task:** After updating statuses, use \`get_next_task_recommendation\` to see what to work on next.\n";
  new_guidance += "    *   Example: \`get_next_task_recommendation({ projectId: \"" + exampleProjectId + "\" })\`\n\n";

  new_guidance += "⚠️ **Important Note:** This analysis is based on code patterns and keywords. Manual verification of inferred statuses is highly recommended before making critical decisions or reporting progress.";
  report += new_guidance;

  return report;
}
