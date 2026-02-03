/**
 * Artifact types for the orchestration workflow
 * 
 * Artifacts are phase-specific knowledge files stored alongside task.json
 * Each phase (explore, search, plan, build, test) produces an artifact
 * that subsequent phases can read and build upon.
 */

/**
 * Valid artifact phases in the orchestration workflow
 */
export type ArtifactPhase = 'explore' | 'search' | 'plan' | 'build' | 'test';

/**
 * All valid artifact phases as an array (useful for iteration)
 */
export const ARTIFACT_PHASES: ArtifactPhase[] = ['explore', 'search', 'plan', 'build', 'test'];

/**
 * Required phases that must be present in every workflow
 */
export const REQUIRED_PHASES: ArtifactPhase[] = ['explore', 'plan', 'build'];

/**
 * Optional phases that may be skipped
 */
export const OPTIONAL_PHASES: ArtifactPhase[] = ['search', 'test'];

/**
 * Artifact metadata stored in YAML frontmatter
 */
export interface ArtifactMetadata {
  /** Phase this artifact belongs to */
  phase: ArtifactPhase;
  /** Status of this phase */
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  /** Timestamp when the artifact was created */
  createdAt: string;
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
  metadata: ArtifactMetadata;
  /** Markdown content of the artifact */
  content: string;
}

/**
 * Map of all artifacts for a task
 */
export interface TaskArtifacts {
  explore?: Artifact;
  search?: Artifact;
  plan?: Artifact;
  build?: Artifact;
  test?: Artifact;
}

/**
 * Input for creating/updating an artifact
 */
export interface ArtifactInput {
  /** Markdown content for the artifact body */
  content: string;
  /** Status of the phase (defaults to 'completed' for create, preserves for update) */
  status?: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
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
 * Human-readable descriptions for each phase
 */
export const PHASE_DESCRIPTIONS: Record<ArtifactPhase, string> = {
  explore: 'Codebase analysis and discovery findings',
  search: 'External research and documentation findings',
  plan: 'Implementation approach and step-by-step plan',
  build: 'Implementation changes and modifications made',
  test: 'Test execution results and verification status'
};

/**
 * Tool descriptions for each operation type
 */
export const OPERATION_DESCRIPTIONS = {
  create: {
    explore: 'Create the explore artifact with codebase analysis findings. Use after analyzing the repository to document relevant files, logic entry points, and unknowns.',
    search: 'Create the search artifact with external research findings. Use after web research to document patterns, best practices, and solutions found.',
    plan: 'Create the plan artifact with the implementation approach. Use after designing the solution to document step-by-step implementation plan.',
    build: 'Create the build artifact documenting implementation changes. Use after making code changes to document what was modified and why.',
    test: 'Create the test artifact with verification results. Use after running tests to document results, pass/fail status, and any issues found.'
  },
  update: {
    explore: 'Update the explore artifact with additional analysis findings or corrections.',
    search: 'Update the search artifact with additional research findings or corrections.',
    plan: 'Update the plan artifact with revised approach or additional implementation steps.',
    build: 'Update the build artifact with additional changes or corrections to the implementation record.',
    test: 'Update the test artifact with additional test results or corrections.'
  },
  delete: {
    explore: 'Delete the explore artifact. Use to reset the exploration phase for re-analysis.',
    search: 'Delete the search artifact. Use to reset the research phase for new research.',
    plan: 'Delete the plan artifact. Use to reset the planning phase for a new approach.',
    build: 'Delete the build artifact. Use to reset the build phase record.',
    test: 'Delete the test artifact. Use to reset the testing phase for re-verification.'
  }
};
