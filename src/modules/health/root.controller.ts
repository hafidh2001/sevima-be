import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';

@Controller()
export class RootController {
  @Get()
  @Public()
  getRoot() {
    return 'Selamat mengoding Haped';
  }
}
