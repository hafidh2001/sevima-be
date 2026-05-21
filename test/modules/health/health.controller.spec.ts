import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../../../src/modules/health/health.controller';
import { HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from '../../../src/modules/health/database.health';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let databaseHealth: DatabaseHealthIndicator;

  beforeEach(async () => {
    const mockHealthCheckService = {
      check: jest.fn().mockResolvedValue({ status: 'ok' }),
    };

    const mockDatabaseHealth = {
      isHealthy: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: DatabaseHealthIndicator, useValue: mockDatabaseHealth },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
    databaseHealth = module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return health check result', async () => {
    const result = await controller.check();
    expect(result).toBeDefined();
    expect(healthCheckService.check).toHaveBeenCalled();
  });
});
