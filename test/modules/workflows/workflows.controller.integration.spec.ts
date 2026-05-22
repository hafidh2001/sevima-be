import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WorkflowsController } from '../../../src/modules/workflows/workflows.controller';
import { WorkflowsService } from '../../../src/modules/workflows/workflows.service';
import { JwtAuthGuard } from '../../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/common/guards/roles.guard';
import { CreateWorkflowDto } from '../../../src/modules/workflows/dto/create-workflow.dto';
import { UpdateWorkflowDto } from '../../../src/modules/workflows/dto/update-workflow.dto';
import { PaginatedResponse } from '../../../src/common/dto/pagination.dto';

import { WorkflowRunsService } from '../../../src/modules/workflows/runs/workflow-runs.service';

describe('WorkflowsController (Integration)', () => {
  let controller: WorkflowsController;
  let mockWorkflowsService: Partial<WorkflowsService>;
  let mockWorkflowRunsService: Partial<WorkflowRunsService>;

  beforeEach(async () => {
    mockWorkflowsService = {
      create: jest.fn().mockResolvedValue({
        id: 1,
        name: 'Test Workflow',
        description: 'Test Description',
        tenantId: 1,
        isActive: true,
        createdAt: new Date(),
        versions: [],
      }),
      findAll: jest.fn().mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, perPage: 10, totalPages: 0 },
      }),
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        name: 'Test Workflow',
        description: 'Test Description',
        tenantId: 1,
        isActive: true,
      }),
      findVersions: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({
        id: 1,
        name: 'Updated Workflow',
        description: 'Updated Description',
      }),
      rollback: jest.fn().mockResolvedValue({
        message: 'Successfully rolled back to version 1',
        version: { id: 2, version: 2, definition: {} },
      }),
      updateStatus: jest.fn().mockResolvedValue({ id: 1, isActive: false }),
      delete: jest.fn().mockResolvedValue({ message: 'Workflow 1 deleted successfully' }),
    };

    mockWorkflowRunsService = {
      trigger: jest.fn().mockResolvedValue({ runId: 1 }),
      findAll: jest.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, perPage: 10, totalPages: 0 } }),
      getStats: jest.fn().mockResolvedValue({ totalRuns: 0, successRate: 0, avgDuration: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [
        {
          provide: WorkflowsService,
          useValue: mockWorkflowsService,
        },
        {
          provide: WorkflowRunsService,
          useValue: mockWorkflowRunsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowsController>(WorkflowsController);
  });

  describe('create', () => {
    it('should create a new workflow', async () => {
      const createDto: CreateWorkflowDto = {
        name: 'New Workflow',
        description: 'A new workflow',
        definition: {
          nodes: [
            { id: 'start', type: 'START', name: 'Start', config: {} },
            { id: 'end', type: 'END', name: 'End', config: {} },
          ],
          edges: [{ from: 'start', to: 'end' }],
        },
      };

      const result = await controller.create(1, 1, createDto);

      expect(result).toBeDefined();
      expect(mockWorkflowsService.create).toHaveBeenCalledWith(1, 1, createDto);
    });

    it('should pass validation errors from service', async () => {
      const createDto = {
        name: 'Invalid Workflow',
        description: 'Missing nodes',
        definition: {
          nodes: [],
          edges: [],
        },
      };

      (mockWorkflowsService.create as jest.Mock).mockRejectedValueOnce(
        new Error('Workflow validation failed'),
      );

      await expect(controller.create(1, 1, createDto as any)).rejects.toThrow('Workflow validation failed');
    });
  });

  describe('findAll', () => {
    it('should return paginated workflows', async () => {
      const result = await controller.findAll(1, { page: 1, limit: 10 });

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      expect(result.meta).toBeDefined();
      expect(result.meta.total).toBe(0);
    });

    it('should accept pagination parameters', async () => {
      await controller.findAll(1, { page: 2, limit: 20 });

      expect(mockWorkflowsService.findAll).toHaveBeenCalledWith(1, expect.objectContaining({
        page: 2,
        limit: 20,
      }));
    });

    it('should accept filter parameters', async () => {
      await controller.findAll(1, { isActive: true, name: 'test' });

      expect(mockWorkflowsService.findAll).toHaveBeenCalledWith(1, expect.objectContaining({
        isActive: true,
        name: 'test',
      }));
    });
  });

  describe('findOne', () => {
    it('should return a single workflow', async () => {
      const result = await controller.findOne(1, 1);

      expect(result).toBeDefined();
      expect(mockWorkflowsService.findOne).toHaveBeenCalledWith(1, 1);
    });

    it('should return null when workflow not found', async () => {
      (mockWorkflowsService.findOne as jest.Mock).mockResolvedValueOnce(null);

      const result = await controller.findOne(1, 999);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a workflow', async () => {
      const updateDto: UpdateWorkflowDto = {
        name: 'Updated Name',
        description: 'Updated Description',
      };

      const result = await controller.update(1, 1, 1, updateDto);

      expect(result).toBeDefined();
      expect(mockWorkflowsService.update).toHaveBeenCalledWith(1, 1, 1, updateDto);
    });

    it('should pass validation errors from service', async () => {
      const updateDto = {
        name: '',
      };

      (mockWorkflowsService.update as jest.Mock).mockRejectedValueOnce(
        new Error('Validation failed'),
      );

      await expect(controller.update(1, 1, 1, updateDto as any)).rejects.toThrow('Validation failed');
    });
  });

  describe('rollback', () => {
    it('should rollback to a specific version', async () => {
      const result = await controller.rollback(1, 1, 1);

      expect(result).toBeDefined();
      expect(mockWorkflowsService.rollback).toHaveBeenCalledWith(1, 1, 1);
    });

    it('should throw NotFoundException for non-existent version', async () => {
      (mockWorkflowsService.rollback as jest.Mock).mockRejectedValueOnce(new Error('Version not found'));

      await expect(controller.rollback(1, 1, 999)).rejects.toThrow();
    });
  });

  describe('updateStatus', () => {
    it('should update workflow active status', async () => {
      const result = await controller.updateStatus(1, 1, { isActive: false });

      expect(result).toBeDefined();
      expect(mockWorkflowsService.updateStatus).toHaveBeenCalledWith(1, 1, false);
    });
  });

  describe('delete', () => {
    it('should delete a workflow', async () => {
      const result = await controller.delete(1, 1);

      expect(result).toBeDefined();
      expect(result.message).toContain('deleted successfully');
      expect(mockWorkflowsService.delete).toHaveBeenCalledWith(1, 1);
    });
  });
});
