import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'List all active tenants',
    description: 'Returns list of all active tenants for registration dropdown',
  })
  @ApiResponse({
    status: 200,
    description: 'List of active tenants',
    schema: {
      example: [
        { id: 1, name: 'FlowForge Demo', slug: 'flowforge-demo' },
        { id: 2, name: 'Acme Corp', slug: 'acme-corp' },
      ],
    },
  })
  async findAll() {
    return this.tenantsService.findAll();
  }
}
