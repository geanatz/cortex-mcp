/**
 * Valid artifact phases in the orchestration workflow
 */
export type ArtifactPhaseType = 'explore' | 'search' | 'plan' | 'build' | 'test';

/**
 * Valid artifact operations
 */
export type ArtifactOperation = 'create' | 'update' | 'delete';

/**
 * Configuration for artifact tools
 */
export interface ArtifactToolConfig {
  /** Working directory for the operation */
  workingDirectory: string;
  /** Task ID for the operation */
  taskId: string;
}

// Import the existing types from the artifact model
export { 
  type ArtifactPhase, 
  type ArtifactStatus,
  ARTIFACT_PHASES,
  ARTIFACT_STATUSES,
  PHASE_DESCRIPTIONS,
  OPERATION_DESCRIPTIONS
} from '../../models/artifact';

/**
 * Input interface for create operations
 */
export interface CreateArtifactInput extends Record<string, unknown> {
  /** Working directory for the operation */
  workingDirectory: string;
  /** Task ID for the operation */
  taskId: string;
  /** Markdown content for the artifact */
  content: string;
  /** Status of this phase (defaults to "completed") */
  status?: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  /** Number of retry attempts for this phase */
  retries?: number;
  /** Error message if status is "failed" */
  error?: string;
}

/**
 * Input interface for update operations
 */
export interface UpdateArtifactInput extends Record<string, unknown> {
  /** Working directory for the operation */
  workingDirectory: string;
  /** Task ID for the operation */
  taskId: string;
  /** Updated markdown content for the artifact */
  content?: string;
  /** Updated status of this phase */
  status?: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  /** Updated number of retry attempts */
  retries?: number;
  /** Updated error message */
  error?: string;
}

/**
 * Input interface for delete operations
 */
export interface DeleteArtifactInput extends Record<string, unknown> {
  /** Working directory for the operation */
  workingDirectory: string;
  /** Task ID for the operation */
  taskId: string;
  /** Confirmation flag for deletion (safety measure) */
  confirm: boolean;
}

/**
 * Union type for all artifact operation inputs
 */
export type ArtifactInput = 
  | CreateArtifactInput 
  | UpdateArtifactInput 
  | DeleteArtifactInput;