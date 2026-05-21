import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma.service';
import {
  DAGDefinition,
  DAGNode,
  ExecutionContext,
  StepExecutionResult,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_WORKFLOW_TIMEOUT,
  WorkflowTimeoutError,
} from './dag.types';
import { DAGValidator } from './dag-validator';
import { DAGSorter } from './dag-sorter';
import { StepType, StepStatus } from '@prisma/client';

interface StepEventPayload {
  runId: number;
  stepId: string;
  status: StepStatus;
  output?: any;
  error?: string;
  retryCount?: number;
}

@Injectable()
export class DAGExecutor {
  private readonly logger = new Logger(DAGExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: DAGValidator,
    private readonly sorter: DAGSorter,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(workflowRunId: number, definition: DAGDefinition, context: ExecutionContext): Promise<Map<string, StepExecutionResult>> {
    const { isValid, errors } = this.validator.validate(definition);

    if (!isValid) {
      this.logger.error(`Workflow ${workflowRunId} has invalid definition: ${JSON.stringify(errors)}`);
      throw new Error(`Invalid workflow definition: ${errors.map((e) => e.message).join(', ')}`);
    }

    const executionPlan = this.sorter.createExecutionPlan(definition.nodes, definition.edges);
    this.logger.log(`Executing workflow ${workflowRunId} with ${executionPlan.stages.length} stages`);

    // Only set startTime if not already set
    if (!context.startTime) {
      context.startTime = new Date();
    }

    // Execute stages
    for (const stage of executionPlan.stages) {
      if (context.timeout) {
        const elapsed = Date.now() - context.startTime.getTime();
        if (elapsed > context.timeout) {
          this.logger.error(`Workflow ${workflowRunId} timed out after ${elapsed}ms (timeout: ${context.timeout}ms)`);
          throw new WorkflowTimeoutError(workflowRunId, context.timeout, elapsed);
        }
      }

      this.logger.log(`Executing stage ${stage.stageNumber}: ${stage.nodes.map((n) => n.id).join(', ')}`);

      if (stage.isParallel) {
        // Execute nodes in parallel
        await Promise.all(
          stage.nodes.map((node) =>
            this.executeNode(workflowRunId, node, context),
          ),
        );
      } else {
        // Execute nodes sequentially
        for (const node of stage.nodes) {
          await this.executeNode(workflowRunId, node, context);
        }
      }
    }

    return context.results;
  }

  private async executeNode(workflowRunId: number, node: DAGNode, context: ExecutionContext): Promise<StepExecutionResult> {
    const retryConfig: RetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...node.retryConfig,
    };

    let lastError: string | undefined;
    let attempt = 0;

    while (attempt <= retryConfig.maxRetries) {
      try {
        const result = await this.executeStep(workflowRunId, node, context);
        context.results.set(node.id, result);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        attempt++;

        if (attempt <= retryConfig.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt, retryConfig);
          const delaySeconds = (delay / 1000).toFixed(1);
          this.logger.warn(`Attempt ${attempt} failed, retrying in ${delaySeconds}s...`);
          await this.delay(delay);

          // Update step run with retry info
          await this.updateStepRun(workflowRunId, node.id, {
            status: StepStatus.FAILED,
            retryCount: attempt,
            error: lastError,
          });
        } else {
          this.logger.error(`Attempt ${attempt} failed, max retries exhausted`);
        }
      }
    }

    // All retries exhausted
    const failedResult: StepExecutionResult = {
      nodeId: node.id,
      status: 'FAILED',
      error: lastError || 'Max retries exceeded',
      retryCount: attempt - 1,
      completedAt: new Date(),
    };

    context.results.set(node.id, failedResult);

    // Emit final FAILED event with retry info
    this.emitStepEvent(workflowRunId, node.id, StepStatus.FAILED, undefined, failedResult.error, failedResult.retryCount);

    return failedResult;
  }

  private async executeStep(
    workflowRunId: number,
    node: DAGNode,
    context: ExecutionContext,
  ): Promise<StepExecutionResult> {
    const startedAt = new Date();

    // Update status to RUNNING
    await this.updateStepRun(workflowRunId, node.id, {
      status: StepStatus.RUNNING,
      startedAt,
    });

    // Emit RUNNING event
    this.emitStepEvent(workflowRunId, node.id, StepStatus.RUNNING);

    try {
      let output: any;
      let status: 'SUCCESS' | 'FAILED' | 'SKIPPED' = 'SUCCESS';

      switch (node.type.toUpperCase()) {
        case 'HTTP_CALL':
          output = await this.executeHttpCall(node, context);
          break;

        case 'SCRIPT':
          output = await this.executeScript(node, context);
          break;

        case 'DELAY':
          await this.executeDelay(node, context);
          output = { delayed: true, duration: node.config?.delay };
          break;

        case 'CONDITIONAL':
          output = await this.evaluateConditional(node, context);
          break;

        case 'START':
        case 'END':
          output = { executed: true };
          break;

        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      const completedAt = new Date();
      const finalStatus = status === 'SUCCESS' ? StepStatus.SUCCESS : StepStatus.SKIPPED;

      await this.updateStepRun(workflowRunId, node.id, {
        status: finalStatus,
        output,
        startedAt,
        completedAt,
      });

      // Emit SUCCESS event
      this.emitStepEvent(workflowRunId, node.id, finalStatus, output);

      return {
        nodeId: node.id,
        status,
        output,
        startedAt,
        completedAt,
        retryCount: 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const completedAt = new Date();

      await this.updateStepRun(workflowRunId, node.id, {
        status: StepStatus.FAILED,
        error: errorMessage,
        startedAt,
        completedAt,
      });

      // Emit FAILED event
      this.emitStepEvent(workflowRunId, node.id, StepStatus.FAILED, undefined, errorMessage);

      throw error;
    }
  }

  private emitStepEvent(
    runId: number,
    stepId: string,
    status: StepStatus,
    output?: any,
    error?: string,
    retryCount?: number,
  ): void {
    const payload: StepEventPayload = {
      runId,
      stepId,
      status,
      output,
      error,
      retryCount,
    };
    this.eventEmitter.emit('step.update', payload);
  }

  private async executeHttpCall(node: DAGNode, context: ExecutionContext): Promise<any> {
    const { url, method = 'GET', headers = {}, body } = node.config || {};

    if (!url) {
      throw new Error('HTTP_CALL node missing url config');
    }

    // Replace variables in URL
    const resolvedUrl = this.resolveVariables(url, context.variables);

    this.logger.log(`Executing HTTP ${method} to ${resolvedUrl}`);

    try {
      const response = await fetch(resolvedUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body ? JSON.stringify(this.resolveVariables(body, context.variables)) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return { status: response.status, data };
    } catch (error) {
      throw new Error(`HTTP call failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeScript(node: DAGNode, context: ExecutionContext): Promise<any> {
    const { script, language = 'javascript' } = node.config || {};

    if (!script) {
      throw new Error('SCRIPT node missing script config');
    }

    this.logger.log(`Executing ${language} script`);

    // Simple script execution (in production, use a sandboxed environment)
    try {
      // Create a function with limited scope
      const fn = new Function(
        'context',
        'variables',
        `
        const { results, workflowRunId, tenantId } = context;
        const { ...vars } = variables;
        ${script}
      `,
      );

      return fn(context, context.variables);
    } catch (error) {
      throw new Error(`Script execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeDelay(node: DAGNode, context: ExecutionContext): Promise<void> {
    const delay = node.config?.delay || 1000;
    this.logger.log(`Delaying for ${delay}ms`);
    await this.delay(delay);
  }

  private async evaluateConditional(node: DAGNode, context: ExecutionContext): Promise<any> {
    const { condition } = node.config || {};

    if (!condition) {
      throw new Error('CONDITIONAL node missing condition config');
    }

    try {
      // Simple condition evaluation (in production, use a proper expression evaluator)
      const fn = new Function(
        'variables',
        `const { ...vars } = variables; return ${condition};`,
      );

      const result = fn(context.variables);
      return { condition, result, shouldContinue: !!result };
    } catch (error) {
      throw new Error(`Conditional evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async updateStepRun(
    workflowRunId: number,
    stepId: string,
    data: Partial<{
      status: StepStatus;
      output: any;
      error: string;
      startedAt: Date;
      completedAt: Date;
      retryCount: number;
    }>,
  ): Promise<void> {
    try {
      await this.prisma.stepRun.updateMany({
        where: {
          workflowRunId,
          stepId,
        },
        data: {
          ...data,
          ...(data.output && { output: data.output as any }),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update step run: ${error}`);
    }
  }

  private calculateBackoffDelay(attempt: number, config: RetryConfig): number {
    const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(delay, config.maxDelay);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resolveVariables(template: string | any, variables: Record<string, any>): any {
    if (typeof template === 'string') {
      return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
    }
    if (Array.isArray(template)) {
      return template.map((item) => this.resolveVariables(item, variables));
    }
    if (typeof template === 'object' && template !== null) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(template)) {
        resolved[key] = this.resolveVariables(value, variables);
      }
      return resolved;
    }
    return template;
  }
}
