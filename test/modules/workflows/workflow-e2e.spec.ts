import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkflowRunsListener } from '../../../src/modules/workflows/runs/workflow-runs.listener';
import { WorkflowRunsService } from '../../../src/modules/workflows/runs/workflow-runs.service';
import { DAGExecutor } from '../../../src/modules/workflows/dag/dag-executor';
import { DAGValidator } from '../../../src/modules/workflows/dag/dag-validator';
import { DAGSorter } from '../../../src/modules/workflows/dag/dag-sorter';
import { SseService } from '../../../src/modules/sse/sse.service';
import { StepLogService } from '../../../src/modules/workflows/logs/step-log.service';
import { PrismaService } from '../../../src/database/prisma.service';
import { StepStatus, RunStatus } from '@prisma/client';

describe('Workflow E2E - Full Execution Flow', () => {
  let listener: WorkflowRunsListener;
  let prismaService: jest.Mocked<PrismaService>;
  let dagExecutor: DAGExecutor;
  let sseService: SseService;
  let stepLogService: jest.Mocked<StepLogService>;

  const mockPrismaService = {
    workflowRun: {
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    stepRun: {
      create: jest.fn().mockImplementation((data) => Promise.resolve({ id: Math.random(), ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockSseService = {
    broadcastStepEvent: jest.fn(),
  };

  const mockStepLogService = {
    log: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowRunsListener,
        WorkflowRunsService,
        DAGExecutor,
        DAGValidator,
        DAGSorter,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SseService, useValue: mockSseService },
        { provide: StepLogService, useValue: mockStepLogService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    listener = module.get<WorkflowRunsListener>(WorkflowRunsListener);
    prismaService = module.get(PrismaService);
    dagExecutor = module.get<DAGExecutor>(DAGExecutor);
    sseService = module.get<SseService>(SseService);
    stepLogService = module.get(StepLogService);
  });

  describe('workflow.run event', () => {
    const simpleWorkflowDefinition = {
      nodes: [
        { id: 'start', type: 'START', name: 'Start', config: {} },
        { id: 'http', type: 'HTTP_CALL', name: 'Fetch Data', config: { url: 'http://example.com', method: 'GET' } },
        { id: 'end', type: 'END', name: 'End', config: {} },
      ],
      edges: [
        { from: 'start', to: 'http' },
        { from: 'http', to: 'end' },
      ],
    };

    it('should create step run records for each node', async () => {
      const event = {
        runId: 1,
        workflowId: 1,
        definition: simpleWorkflowDefinition,
        variables: {},
        userId: 1,
        tenantId: 1,
      };

      // Mock successful HTTP call
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      } as Response);

      await listener.handleWorkflowRun(event);

      // Verify step runs were created for each node
      expect(mockPrismaService.stepRun.create).toHaveBeenCalledTimes(3);
    });

    it('should update workflow run status to RUNNING', async () => {
      const event = {
        runId: 1,
        workflowId: 1,
        definition: simpleWorkflowDefinition,
        variables: {},
        userId: 1,
        tenantId: 1,
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      } as Response);

      await listener.handleWorkflowRun(event);

      expect(mockPrismaService.workflowRun.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: RunStatus.RUNNING },
      });
    });

    it('should log step initialization', async () => {
      const event = {
        runId: 1,
        workflowId: 1,
        definition: simpleWorkflowDefinition,
        variables: {},
        userId: 1,
        tenantId: 1,
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      } as Response);

      await listener.handleWorkflowRun(event);

      expect(mockStepLogService.log).toHaveBeenCalled();
    });

    it('should broadcast step events via SSE', async () => {
      // The handleWorkflowRun method doesn't directly broadcast SSE events
      // It triggers DAG execution which emits step.update events
      // SSE broadcasting happens in handleStepUpdate
      const stepPayload = {
        runId: 1,
        stepId: 'http',
        status: StepStatus.RUNNING,
        output: undefined,
        error: undefined,
        retryCount: 0,
      };

      mockPrismaService.stepRun.findFirst.mockResolvedValueOnce({
        id: 1,
        workflowRunId: 1,
        stepId: 'http',
        stepName: 'HTTP Request',
        status: StepStatus.RUNNING,
      });

      await listener.handleStepUpdate(stepPayload);

      // Step update events should be broadcast
      expect(mockSseService.broadcastStepEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 1,
          stepId: 'http',
          status: StepStatus.RUNNING,
        }),
      );
    });
  });

  describe('step.update event', () => {
    it('should broadcast step status updates', async () => {
      const payload = {
        runId: 1,
        stepId: 'http',
        status: StepStatus.RUNNING,
        output: undefined,
        error: undefined,
        retryCount: 0,
      };

      mockPrismaService.stepRun.findFirst.mockResolvedValueOnce({
        id: 1,
        workflowRunId: 1,
        stepId: 'http',
        stepName: 'HTTP Request',
        status: StepStatus.RUNNING,
      });

      await listener.handleStepUpdate(payload);

      expect(mockSseService.broadcastStepEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 1,
          stepId: 'http',
          status: StepStatus.RUNNING,
        }),
      );
    });

    it('should log step status changes', async () => {
      const payload = {
        runId: 1,
        stepId: 'http',
        status: StepStatus.SUCCESS,
        output: { data: 'result' },
        error: undefined,
        retryCount: 0,
      };

      mockPrismaService.stepRun.findFirst.mockResolvedValueOnce({
        id: 1,
        workflowRunId: 1,
        stepId: 'http',
        stepName: 'HTTP Request',
        status: StepStatus.SUCCESS,
      });

      await listener.handleStepUpdate(payload);

      expect(mockStepLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          stepRunId: 1,
          level: 'INFO',
          message: expect.stringContaining('completed successfully'),
        }),
      );
    });

    it('should log failed steps as ERROR', async () => {
      const payload = {
        runId: 1,
        stepId: 'http',
        status: StepStatus.FAILED,
        output: undefined,
        error: 'Connection timeout',
        retryCount: 3,
      };

      mockPrismaService.stepRun.findFirst.mockResolvedValueOnce({
        id: 1,
        workflowRunId: 1,
        stepId: 'http',
        stepName: 'HTTP Request',
        status: StepStatus.FAILED,
      });

      await listener.handleStepUpdate(payload);

      expect(mockStepLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          stepRunId: 1,
          level: 'ERROR',
          message: expect.stringContaining('failed'),
        }),
      );
    });
  });

  describe('parallel execution', () => {
    it('should handle parallel nodes correctly', async () => {
      const parallelWorkflow = {
        nodes: [
          { id: 'start', type: 'START', name: 'Start', config: {} },
          { id: 'step1', type: 'HTTP_CALL', name: 'Step 1', config: { url: 'http://example.com/1', method: 'GET' } },
          { id: 'step2', type: 'HTTP_CALL', name: 'Step 2', config: { url: 'http://example.com/2', method: 'GET' } },
          { id: 'end', type: 'END', name: 'End', config: {} },
        ],
        edges: [
          { from: 'start', to: 'step1' },
          { from: 'start', to: 'step2' },
          { from: 'step1', to: 'end' },
          { from: 'step2', to: 'end' },
        ],
      };

      const event = {
        runId: 1,
        workflowId: 1,
        definition: parallelWorkflow,
        variables: {},
        userId: 1,
        tenantId: 1,
      };

      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: '1' }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: '2' }) } as Response);

      await listener.handleWorkflowRun(event);

      // Verify both parallel steps were created
      expect(mockPrismaService.stepRun.create).toHaveBeenCalledTimes(4);
    });
  });

  describe('retry behavior', () => {
    it('should handle retries with exponential backoff', async () => {
      const workflowWithRetry = {
        nodes: [
          { id: 'start', type: 'START', name: 'Start', config: {} },
          {
            id: 'http',
            type: 'HTTP_CALL',
            name: 'Flaky API',
            config: { url: 'http://flaky.api', method: 'GET' },
            retryConfig: { maxRetries: 2, initialDelay: 10, backoffMultiplier: 2, maxDelay: 100 },
          },
          { id: 'end', type: 'END', name: 'End', config: {} },
        ],
        edges: [
          { from: 'start', to: 'http' },
          { from: 'http', to: 'end' },
        ],
      };

      const event = {
        runId: 1,
        workflowId: 1,
        definition: workflowWithRetry,
        variables: {},
        userId: 1,
        tenantId: 1,
      };

      // Fail twice, then succeed
      let callCount = 0;
      jest.spyOn(global, 'fetch').mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response);
      });

      await listener.handleWorkflowRun(event);

      // Should have called fetch 3 times (2 failures + 1 success)
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
