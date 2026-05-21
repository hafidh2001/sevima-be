import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DAGExecutor } from '../../../src/modules/workflows/dag/dag-executor';
import { DAGValidator } from '../../../src/modules/workflows/dag/dag-validator';
import { DAGSorter } from '../../../src/modules/workflows/dag/dag-sorter';
import { PrismaService } from '../../../src/database/prisma.service';
import { WorkflowTimeoutError } from '../../../src/modules/workflows/dag/dag.types';
import { StepStatus, RunStatus } from '@prisma/client';

describe('DAGExecutor', () => {
  let executor: DAGExecutor;
  let prismaService: jest.Mocked<PrismaService>;
  let validator: DAGValidator;
  let sorter: DAGSorter;
  let eventEmitter: EventEmitter2;

  const mockPrismaService = {
    stepRun: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    workflowRun: {
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DAGExecutor,
        DAGValidator,
        DAGSorter,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    executor = module.get<DAGExecutor>(DAGExecutor);
    prismaService = module.get(PrismaService);
    validator = module.get<DAGValidator>(DAGValidator);
    sorter = module.get<DAGSorter>(DAGSorter);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('Retry Logic', () => {
    const createDefinition = (failCount: number = 0) => ({
      nodes: [
        { id: 'start', type: 'START', name: 'Start', config: {} },
        {
          id: 'http',
          type: 'HTTP_CALL',
          name: 'HTTP Request',
          config: {
            url: 'http://example.com/api',
            method: 'GET',
          },
          retryConfig: {
            maxRetries: 3,
            initialDelay: 100,
            maxDelay: 1000,
            backoffMultiplier: 2,
          },
        },
        { id: 'end', type: 'END', name: 'End', config: {} },
      ],
      edges: [
        { from: 'start', to: 'http' },
        { from: 'http', to: 'end' },
      ],
    });

    it('should succeed on second attempt when first attempt fails', async () => {
      let attemptCount = 0;
      const definition = createDefinition(1);

      // Mock fetch to fail first time, then succeed
      const mockFetch = jest.spyOn(global, 'fetch').mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response);
      });

      const context = {
        workflowRunId: 1,
        tenantId: 1,
        userId: 1,
        variables: {},
        results: new Map(),
        startTime: new Date(),
      };

      const result = await executor.execute(1, definition, context);

      expect(result.has('http')).toBe(true);
      expect(result.get('http')?.status).toBe('SUCCESS');
      expect(attemptCount).toBe(2);

      mockFetch.mockRestore();
    });

    it('should fail after max retries exhausted', async () => {
      const definition = createDefinition(3);

      // Mock fetch to always fail
      const mockFetch = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Persistent error'));

      const context = {
        workflowRunId: 1,
        tenantId: 1,
        userId: 1,
        variables: {},
        results: new Map(),
        startTime: new Date(),
      };

      const result = await executor.execute(1, definition, context);

      expect(result.has('http')).toBe(true);
      expect(result.get('http')?.status).toBe('FAILED');
      expect(result.get('http')?.retryCount).toBe(3);
      expect(result.get('http')?.error).toContain('Persistent error');

      mockFetch.mockRestore();
    });

    it('should not retry when maxRetries is 0', async () => {
      const definition = {
        nodes: [
          { id: 'start', type: 'START', name: 'Start', config: {} },
          {
            id: 'http',
            type: 'HTTP_CALL',
            name: 'HTTP Request',
            config: {
              url: 'http://example.com/api',
              method: 'GET',
            },
            retryConfig: {
              maxRetries: 0,
              initialDelay: 100,
              maxDelay: 1000,
              backoffMultiplier: 2,
            },
          },
          { id: 'end', type: 'END', name: 'End', config: {} },
        ],
        edges: [
          { from: 'start', to: 'http' },
          { from: 'http', to: 'end' },
        ],
      };

      const mockFetch = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Error'));

      const context = {
        workflowRunId: 1,
        tenantId: 1,
        userId: 1,
        variables: {},
        results: new Map(),
        startTime: new Date(),
      };

      const result = await executor.execute(1, definition, context);

      expect(result.get('http')?.status).toBe('FAILED');
      expect(result.get('http')?.retryCount).toBe(0);

      mockFetch.mockRestore();
    });
  });

  describe('Global Timeout', () => {
    it('should not throw when execution completes within timeout', async () => {
      const definition = {
        nodes: [
          { id: 'start', type: 'START', name: 'Start', config: {} },
          { id: 'end', type: 'END', name: 'End', config: {} },
        ],
        edges: [
          { from: 'start', to: 'end' },
        ],
      };

      const context = {
        workflowRunId: 1,
        tenantId: 1,
        userId: 1,
        variables: {},
        results: new Map(),
        startTime: new Date(),
        timeout: 60000, // 1 minute timeout
      };

      const result = await executor.execute(1, definition, context);

      expect(result.has('start')).toBe(true);
      expect(result.has('end')).toBe(true);
    });

    it('should throw WorkflowTimeoutError when timeout is exceeded between stages', async () => {
      // The timeout check happens at stage boundaries, not during step execution
      // So we need to set a very short timeout and rely on the check happening
      // at the start of the next stage

      const definition = {
        nodes: [
          { id: 'start', type: 'START', name: 'Start', config: {} },
          { id: 'step1', type: 'START', name: 'Step 1', config: {} },
          { id: 'step2', type: 'START', name: 'Step 2', config: {} },
          { id: 'end', type: 'END', name: 'End', config: {} },
        ],
        edges: [
          { from: 'start', to: 'step1' },
          { from: 'step1', to: 'step2' },
          { from: 'step2', to: 'end' },
        ],
      };

      const context = {
        workflowRunId: 1,
        tenantId: 1,
        userId: 1,
        variables: {},
        results: new Map(),
        startTime: new Date(0), // Set to epoch time to ensure timeout is immediately exceeded
        timeout: 1, // 1ms timeout - will be exceeded immediately
      };

      await expect(executor.execute(1, definition, context)).rejects.toThrow(WorkflowTimeoutError);
    }, 10000);

    it('should throw WorkflowTimeoutError with correct properties', async () => {
      const definition = {
        nodes: [
          { id: 'start', type: 'START', name: 'Start', config: {} },
          { id: 'end', type: 'END', name: 'End', config: {} },
        ],
        edges: [
          { from: 'start', to: 'end' },
        ],
      };

      const context = {
        workflowRunId: 42,
        tenantId: 1,
        userId: 1,
        variables: {},
        results: new Map(),
        startTime: new Date(0), // Set to epoch time
        timeout: 5000,
      };

      try {
        await executor.execute(42, definition, context);
        fail('Expected WorkflowTimeoutError to be thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(WorkflowTimeoutError);
        expect(error.workflowRunId).toBe(42);
        expect(error.timeout).toBe(5000);
        expect(error.elapsed).toBeGreaterThan(0);
      }
    }, 10000);
  });
});
