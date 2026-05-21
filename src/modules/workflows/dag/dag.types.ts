import { StepType } from '@prisma/client';

export interface DAGNode {
  id: string;
  type: StepType | string;
  name: string;
  config?: Record<string, any>;
  retryConfig?: RetryConfig;
}

export interface DAGEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface DAGDefinition {
  nodes: DAGNode[];
  edges: DAGEdge[];
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface ExecutionPlan {
  stages: DAGStage[];
  totalSteps: number;
  estimatedDuration?: number;
}

export interface DAGStage {
  stageNumber: number;
  nodes: DAGNode[];
  isParallel: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeFrom?: string;
  edgeTo?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  nodeId?: string;
}

export interface TopologicalSortResult {
  sorted: string[];
  hasParallel: boolean;
  parallelGroups: string[][];
  depth: number;
}

export interface ExecutionContext {
  workflowRunId: number;
  tenantId: number;
  userId?: number;
  variables: Record<string, any>;
  results: Map<string, StepExecutionResult>;
  startTime: Date;
  timeout?: number;
}

export interface StepExecutionResult {
  nodeId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  output?: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

export const DEFAULT_STEP_TIMEOUT = 300000; // 5 minutes
export const DEFAULT_WORKFLOW_TIMEOUT = 3600000; // 1 hour
