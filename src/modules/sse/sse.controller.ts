import {
  Controller,
  Get,
  Param,
  Res,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Req,
  Logger,
  Header,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Observable, Subscription } from 'rxjs';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { SseService, SseEvent } from './sse.service';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('sse')
@ApiBearerAuth('JWT-auth')
@Controller('runs')
export class SseController {
  private readonly logger = new Logger(SseController.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly sseService: SseService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') || 'default-secret';
    this.logger.log(`[SseController] JWT_SECRET configured: ${this.jwtSecret ? '***' : 'NOT FOUND'}`);
  }

  @Get(':runId/stream')
  @Public()
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @ApiOperation({ summary: 'Subscribe to real-time workflow run updates' })
  @ApiParam({ name: 'runId', type: 'number' })
  @ApiResponse({ status: 200, description: 'SSE stream established' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  stream(
    @Param('runId', ParseIntPipe) runId: number,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ): Observable<any> {
    // Extract token: first from query param (EventSource compatibility), then from Authorization header
    const queryToken = (req.query as { token?: string }).token;
    const authHeader = req.headers['authorization'] as string | undefined;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    const token = queryToken || bearerToken;

    this.logger.debug(`SSE stream request: runId=${runId}, hasQueryToken=${!!queryToken}, hasBearerToken=${!!bearerToken}`);

    if (!token) {
      throw new UnauthorizedException('Token is required (either in query param or Authorization header)');
    }

    let userId: number;
    let tenantId: number;

    try {
      // Verify using jsonwebtoken directly with ConfigService secret
      const payload = jwt.verify(token, this.jwtSecret) as any;
      userId = payload.userId || payload.sub || 0;
      tenantId = payload.tenantId || 0;
      this.logger.debug(`JWT verified successfully for userId=${userId}, tenantId=${tenantId}`);
    } catch (err) {
      const error = err as Error;
      this.logger.error(`JWT verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Set CORS headers
    res.header('Access-Control-Allow-Origin', 'http://localhost:8001');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, Accept');

    // Subscribe to events
    return new Observable((observer) => {
      const subscription: Subscription = this.sseService.subscribe(runId, tenantId, userId).subscribe({
        next: (event: SseEvent) => {
          // Format SSE event with event type prefix (e.g., "event: step_update\ndata: {...}\n\n")
          if (event.type) {
            observer.next(`event: ${event.type}\ndata: ${event.data}\n\n`);
          } else {
            observer.next(`data: ${event.data}\n\n`);
          }
        },
        error: (error: Error) => {
          observer.error(error);
        },
        complete: () => {
          observer.complete();
        },
      });

      // Send initial step states (catchup for missed events)
      this.prisma.stepRun.findMany({
        where: { workflowRunId: runId },
        orderBy: { createdAt: 'asc' },
      }).then((stepRuns) => {
        const stepStates = stepRuns.map((sr) => ({
          stepId: sr.stepId,
          status: sr.status as 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED',
          output: sr.output ?? undefined,
          error: sr.error ?? undefined,
        }));
        this.sseService.sendInitialStepStates(runId, stepStates);
      }).catch((err) => {
        this.logger.error(`Failed to fetch initial step states for run ${runId}: ${err}`);
      });

      // Send initial connected event
      observer.next(`event: connected\ndata: ${JSON.stringify({ runId, timestamp: new Date() })}\n\n`);

      // Cleanup on disconnect
      return () => {
        subscription.unsubscribe();
      };
    });
  }

  @Get(':runId/events')
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

  @Get('test-jwt')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test JWT verification' })
  testJwt(@Req() req: FastifyRequest) {
    const token = (req.query as { token?: string }).token;
    const authHeader = req.headers['authorization'] as string | undefined;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const actualToken = token || bearerToken;

    if (!actualToken) {
      return { error: 'No token provided', hasQueryToken: !!token, hasBearerToken: !!bearerToken };
    }

    try {
      const payload = jwt.verify(actualToken, this.jwtSecret) as any;
      return {
        success: true,
        userId: payload.userId || payload.sub,
        tenantId: payload.tenantId,
        configuredSecretLength: this.jwtSecret.length,
      };
    } catch (e) {
      const err = e as Error;
      return {
        error: err.message,
        configuredSecretLength: this.jwtSecret.length,
        configuredSecretPrefix: this.jwtSecret.substring(0, 5),
      };
    }
  }
}
