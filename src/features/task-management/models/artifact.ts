/**
 * Artifact types for the orchestration workflow
 * 
 * Artifacts are phase-specific knowledge files stored alongside .task.json
 * Each phase (explore, search, plan, build, test) produces an artifact
 * that subsequent phases can read and build upon.
 */

/**
 * Valid artifact phases in the orchestration workflow
 */
export const ARTIFACT_PHASES = ['explore', 'search', 'plan', 'build', 'test'] as const;
export type ArtifactPhase = typeof ARTIFACT_PHASES[number];

/**
 * Required phases that must be present in every workflow
 */
export const REQUIRED_PHASES: readonly ArtifactPhase[] = ['explore', 'plan', 'build'] as const;

/**
 * Optional phases that may be skipped
 */
export const OPTIONAL_PHASES: readonly ArtifactPhase[] = ['search', 'test'] as const;

/**
 * Valid artifact status values
 */
export const ARTIFACT_STATUSES = ['pending', 'in-progress', 'completed', 'failed', 'skipped'] as const;
export type ArtifactStatus = typeof ARTIFACT_STATUSES[number];

/**
 * Status display information
 */
export const ARTIFACT_STATUS_INFO: Record<ArtifactStatus, { label: string; icon: string }> = {
  'pending': { label: 'Pending', icon: '⏳' },
  'in-progress': { label: 'In Progress', icon: '🔄' },
  'completed': { label: 'Completed', icon: '✅' },
  'failed': { label: 'Failed', icon: '❌' },
  'skipped': { label: 'Skipped', icon: '⏭️' },
} as const;

/**
 * Phase display information
 */
export const PHASE_INFO: Record<ArtifactPhase, { label: string; icon: string; order: number }> = {
  explore: { label: 'Explore', icon: '🔍', order: 1 },
  search: { label: 'Search', icon: '🌐', order: 2 },
  plan: { label: 'Plan', icon: '📋', order: 3 },
  build: { label: 'Build', icon: '🔨', order: 4 },
  test: { label: 'Test', icon: '🧪', order: 5 },
} as const;

/**
 * Artifact metadata stored in YAML frontmatter
 */
export interface ArtifactMetadata {
  /** Phase this artifact belongs to */
  readonly phase: ArtifactPhase;
  /** Status of this phase */
  status: ArtifactStatus;
  /** Timestamp when the artifact was created */
  readonly createdAt: string;
  /** Timestamp when the artifact was last updated */
  updatedAt: string;
  /** Number of retry attempts for this phase */
  retries?: number;
  /** Optional error message if status is 'failed' */
  error?: string;
}

/**
 * Complete artifact including metadata and content
 */
export interface Artifact {
  /** Artifact metadata */
  readonly metadata: ArtifactMetadata;
  /** Markdown content of the artifact */
  content: string;
}

/**
 * Map of all artifacts for a task
 */
export type TaskArtifacts = {
  readonly [K in ArtifactPhase]?: Artifact;
};

/**
 * Input for creating an artifact
 */
export interface CreateArtifactInput {
  /** Markdown content for the artifact body */
  content: string;
  /** Status of the phase (defaults to 'completed') */
  status?: ArtifactStatus;
  /** Number of retry attempts */
  retries?: number;
  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Input for updating an artifact
 */
export interface UpdateArtifactInput {
  /** Markdown content for the artifact body */
  content?: string;
  /** Status of the phase */
  status?: ArtifactStatus;
  /** Number of retry attempts */
  retries?: number;
  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Get the filename for an artifact phase
 */
export function getArtifactFilename(phase: ArtifactPhase): string {
  return `${phase}.md`;
}

/**
 * Check if a phase is valid
 */
export function isValidPhase(phase: unknown): phase is ArtifactPhase {
  return typeof phase === 'string' && ARTIFACT_PHASES.includes(phase as ArtifactPhase);
}

/**
 * Check if a status is valid
 */
export function isValidArtifactStatus(status: unknown): status is ArtifactStatus {
  return typeof status === 'string' && ARTIFACT_STATUSES.includes(status as ArtifactStatus);
}

/**
 * Get phase label
 */
export function getPhaseLabel(phase: ArtifactPhase): string {
  return PHASE_INFO[phase].label;
}

/**
 * Get phase icon
 */
export function getPhaseIcon(phase: ArtifactPhase): string {
  return PHASE_INFO[phase].icon;
}

/**
 * Get status icon
 */
export function getArtifactStatusIcon(status: ArtifactStatus): string {
  return ARTIFACT_STATUS_INFO[status].icon;
}

/**
 * Human-readable descriptions for each phase
 */
export const PHASE_DESCRIPTIONS: Record<ArtifactPhase, string> = {
  explore: 'Codebase analysis and discovery findings',
  search: 'External research and documentation findings',
  plan: 'Implementation approach and step-by-step plan',
  build: 'Implementation changes and modifications made',
  test: 'Test execution results and verification status'
} as const;

/**
 * Tool descriptions for each operation type
 */
export const OPERATION_DESCRIPTIONS = {
  create: {
    explore: 'Create the explore artifact to capture codebase analysis findings, architectural decisions, and discovered dependencies. Essential for understanding the current state before making changes.',
    search: 'Create the search artifact to document research on best practices, API documentation, and external solutions. Use when gathering information to inform implementation decisions.',
    plan: 'Create the plan artifact to define the step-by-step approach for task completion, including implementation strategy and required resources. Use to establish a clear roadmap before execution.',
    build: 'Create the build artifact to record actual implementation changes, code modifications, and development progress. Critical for tracking what was done and why.',
    test: 'Create the test artifact to document verification results, test outcomes, and quality assurance findings. Use to validate that changes meet requirements and don\'t introduce regressions.'
  },
  update: {
    explore: 'Update the explore artifact to refine analysis findings, add newly discovered information, or correct previous assessments about the codebase.',
    search: 'Update the search artifact to incorporate new research findings, updated best practices, or additional external resources discovered during implementation.',
    plan: 'Update the plan artifact to adjust the implementation approach, modify steps, or adapt the strategy based on new information or changing requirements.',
    build: 'Update the build artifact to reflect additional implementation changes, code adjustments, or progress updates during the development process.',
    test: 'Update the test artifact to record additional test results, verification outcomes, or quality metrics as testing continues throughout the development cycle.'
  },
  delete: {
    explore: 'Delete the explore artifact to reset the analysis phase and start fresh analysis of the codebase from scratch.',
    search: 'Delete the search artifact to clear previous research and initiate a new investigation of external resources and solutions.',
    plan: 'Delete the plan artifact to abandon the current implementation strategy and develop a new approach from scratch.',
    build: 'Delete the build artifact to clear the implementation record and restart the development process for the task.',
    test: 'Delete the test artifact to reset verification results and begin a new round of quality assurance testing.'
  }
} as const;

/**
 * Get workflow progress based on artifact statuses
 */
export function getWorkflowProgress(artifacts: TaskArtifacts): {
  completed: number;
  total: number;
  percentage: number;
  nextPhase?: ArtifactPhase;
} {
  let completed = 0;
  let nextPhase: ArtifactPhase | undefined;
  
  for (const phase of ARTIFACT_PHASES) {
    const artifact = artifacts[phase];
    if (artifact?.metadata.status === 'completed') {
      completed++;
    } else if (!nextPhase && artifact?.metadata.status !== 'skipped') {
      nextPhase = phase;
    }
  }
  
  return {
    completed,
    total: ARTIFACT_PHASES.length,
    percentage: (completed / ARTIFACT_PHASES.length) * 100,
    nextPhase,
  };
}

/**
 * Check if workflow is complete
 */
export function isWorkflowComplete(artifacts: TaskArtifacts): boolean {
  return REQUIRED_PHASES.every(phase => {
    const artifact = artifacts[phase];
    return artifact?.metadata.status === 'completed';
  });
}

/**
 * Get missing required phases
 */
export function getMissingRequiredPhases(artifacts: TaskArtifacts): ArtifactPhase[] {
  return REQUIRED_PHASES.filter(phase => {
    const artifact = artifacts[phase];
    return !artifact || artifact.metadata.status !== 'completed';
  });
}