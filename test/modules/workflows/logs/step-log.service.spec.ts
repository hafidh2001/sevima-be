import { Test, TestingModule } from '@nestjs/testing';
import { StepLogService, LogEntry } from '@/modules/workflows/logs/step-log.service';
import { PrismaService } from '@/database/prisma.service';
import { LogLevel } from '@prisma/client';

describe('StepLogService', () => {
  let service: StepLogService;
  let prismaService: jest.Mocked<PrismaService>;

  const mockPrismaService = {
    stepLog: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StepLogService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<StepLogService>(StepLogService);
    prismaService = mockPrismaService as any;

    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.clearAllTimers();
  });

  describe('log', () => {
    it('should add log entry to buffer', async () => {
      const logEntry: LogEntry = {
        stepRunId: 1,
        level: LogLevel.INFO,
        message: 'Test message',
        metadata: { key: 'value' },
      };

      await service.log(logEntry);

      expect(prismaService.stepLog.createMany).not.toHaveBeenCalled();
    });

    it('should flush when buffer reaches BUFFER_SIZE', async () => {
      mockPrismaService.stepLog.createMany.mockResolvedValue({ count: 100 });

      for (let i = 0; i < 100; i++) {
        await service.log({
          stepRunId: 1,
          level: LogLevel.INFO,
          message: `Message ${i}`,
        });
      }

      expect(prismaService.stepLog.createMany).toHaveBeenCalledTimes(1);
      expect(prismaService.stepLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ message: 'Message 0' }),
          expect.objectContaining({ message: 'Message 99' }),
        ]),
        skipDuplicates: false,
      });
    });
  });

  describe('flush', () => {
    it('should do nothing when buffer is empty', async () => {
      await service.flush();

      expect(prismaService.stepLog.createMany).not.toHaveBeenCalled();
    });

    it('should persist buffered logs', async () => {
      mockPrismaService.stepLog.createMany.mockResolvedValue({ count: 2 });

      await service.log({ stepRunId: 1, level: LogLevel.INFO, message: 'Log 1' });
      await service.log({ stepRunId: 1, level: LogLevel.ERROR, message: 'Log 2' });

      await service.flush();

      expect(prismaService.stepLog.createMany).toHaveBeenCalledWith({
        data: [
          { stepRunId: 1, level: LogLevel.INFO, message: 'Log 1', metadata: undefined },
          { stepRunId: 1, level: LogLevel.ERROR, message: 'Log 2', metadata: undefined },
        ],
        skipDuplicates: false,
      });
    });

    it('should re-add entries to buffer on failure', async () => {
      mockPrismaService.stepLog.createMany.mockRejectedValue(new Error('DB error'));

      await service.log({ stepRunId: 1, level: LogLevel.INFO, message: 'Failed log' });

      await service.flush();

      expect(prismaService.stepLog.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('queryLogs', () => {
    it('should query logs by stepRunId', async () => {
      const mockLogs = [
        { id: 1, stepRunId: 1, level: 'INFO', message: 'Log 1', createdAt: new Date() },
        { id: 2, stepRunId: 1, level: 'ERROR', message: 'Log 2', createdAt: new Date() },
      ];

      mockPrismaService.stepLog.findMany.mockResolvedValue(mockLogs);
      mockPrismaService.stepLog.count.mockResolvedValue(2);

      const result = await service.queryLogs({ stepRunId: 1 });

      expect(result.logs).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(prismaService.stepLog.findMany).toHaveBeenCalledWith({
        where: { stepRunId: 1 },
        orderBy: { createdAt: 'asc' },
        take: 100,
        skip: 0,
      });
    });

    it('should filter by log levels', async () => {
      mockPrismaService.stepLog.findMany.mockResolvedValue([]);
      mockPrismaService.stepLog.count.mockResolvedValue(0);

      await service.queryLogs({ stepRunId: 1, levels: [LogLevel.ERROR] });

      expect(prismaService.stepLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            level: { in: [LogLevel.ERROR] },
          }),
        }),
      );
    });

    it('should respect limit and offset', async () => {
      mockPrismaService.stepLog.findMany.mockResolvedValue([]);
      mockPrismaService.stepLog.count.mockResolvedValue(100);

      await service.queryLogs({ stepRunId: 1, limit: 10, offset: 20 });

      expect(prismaService.stepLog.findMany).toHaveBeenCalledWith({
        where: { stepRunId: 1 },
        orderBy: { createdAt: 'asc' },
        take: 10,
        skip: 20,
      });
    });
  });

  describe('deleteOldLogs', () => {
    it('should delete logs older than retention period', async () => {
      mockPrismaService.stepLog.deleteMany.mockResolvedValue({ count: 500 });

      const result = await service.deleteOldLogs(30);

      expect(result).toBe(500);
      expect(mockPrismaService.stepLog.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: expect.objectContaining({
            lt: expect.any(Date),
          }),
        },
      });
    });
  });
});
