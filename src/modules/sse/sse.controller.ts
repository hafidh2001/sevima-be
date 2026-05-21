import {
  Controller,
  Get,
  Param,
  Res,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Subscription } from 'rxjs';
import { SseService, SseEvent } from './sse.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('sse')
@ApiBearerAuth('JWT-auth')
@Controller('runs')
export class SseController {
  constructor(private readonly sseService: SseService) {}

  @Get(':runId/stream')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Subscribe to real-time workflow run updates' })
  @ApiParam({ name: 'runId', type: 'number' })
  @ApiResponse({ status: 200, description: 'SSE stream established' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  async stream(
    @Param('runId', ParseIntPipe) runId: number,
    @Res() res: Response,
  ) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if behind proxy

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', runId, timestamp: new Date() })}\n\n`);

    // Subscribe to events
    const observable = this.sseService.subscribe(runId, 0);

    const subscription: Subscription = observable.subscribe({
      next: (event: SseEvent) => {
        res.write(`data: ${event.data}\n\n`);
      },
      error: (error: Error) => {
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
      },
      complete: () => {
        res.write(`data: ${JSON.stringify({ type: 'disconnected', runId })}\n\n`);
        res.end();
      },
    });

    // Handle client disconnect
    res.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Get(':runId/events')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get real-time events for a run (long-polling fallback)' })
  @ApiParam({ name: 'runId', type: 'number' })
  @ApiResponse({ status: 200, description: 'Events retrieved' })
  getEvents(@Param('runId', ParseIntPipe) runId: number) {
    return {
      runId,
      message: 'Use GET /runs/:runId/stream for SSE',
      subscriberCount: this.sseService.getSubscriberCount(runId),
    };
  }
}
