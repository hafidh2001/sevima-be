import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface StepEvent {
  runId: number;
  stepId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  timestamp: Date;
  output?: any;
  error?: string;
  retryCount?: number;
}

export interface SseEvent {
  data: string;
  type?: string;
}

interface ClientConnection {
  runId: number;
  userId?: number;
  tenantId: number;
  observer: Subject<SseEvent>;
}

@Injectable()
export class SseService implements OnModuleDestroy {
  private readonly logger = new Logger(SseService.name);
  private readonly connections = new Map<number, ClientConnection[]>();
  private readonly stepEvents$ = new Subject<StepEvent>();

  constructor() {
    this.logger.log('SSE Service initialized');
  }

  onModuleDestroy() {
    // Clean up all connections
    this.connections.forEach((clients) => {
      clients.forEach((client) => {
        client.observer.complete();
      });
    });
    this.connections.clear();
    this.stepEvents$.complete();
    this.logger.log('SSE Service destroyed, all connections cleaned up');
  }

  /**
   * Subscribe to step events for a specific run
   */
  subscribe(runId: number, tenantId: number, userId?: number): Observable<SseEvent> {
    const subject = new Subject<SseEvent>();

    const connection: ClientConnection = {
      runId,
      userId,
      tenantId,
      observer: subject,
    };

    if (!this.connections.has(runId)) {
      this.connections.set(runId, []);
    }
    this.connections.get(runId)!.push(connection);

    this.logger.log(`Client subscribed to run ${runId} (total: ${this.connections.get(runId)!.length})`);

    // Auto-cleanup when observer completes
    subject.subscribe({
      complete: () => {
        this.unsubscribe(runId, subject);
      },
    });

    return subject.asObservable();
  }

  /**
   * Unsubscribe a client
   */
  unsubscribe(runId: number, subject: Subject<SseEvent>): void {
    const clients = this.connections.get(runId);
    if (clients) {
      const index = clients.findIndex((c) => c.observer === subject);
      if (index !== -1) {
        clients.splice(index, 1);
        this.logger.log(`Client unsubscribed from run ${runId} (remaining: ${clients.length})`);
        if (clients.length === 0) {
          this.connections.delete(runId);
        }
      }
    }
  }

  /**
   * Broadcast a step event to all subscribers of a run
   */
  broadcastStepEvent(event: StepEvent): void {
    const clients = this.connections.get(event.runId);
    if (!clients || clients.length === 0) {
      return;
    }

    const message: SseEvent = {
      data: JSON.stringify(event),
      type: 'step-update',
    };

    clients.forEach((client) => {
      try {
        client.observer.next(message);
      } catch (error) {
        this.logger.error(`Error sending event to client: ${error}`);
      }
    });

    this.stepEvents$.next(event);
  }

  /**
   * Broadcast a run status change
   */
  broadcastRunStatus(runId: number, status: string): void {
    const clients = this.connections.get(runId);
    if (!clients || clients.length === 0) {
      return;
    }

    const message: SseEvent = {
      data: JSON.stringify({ runId, status, timestamp: new Date() }),
      type: 'run-status',
    };

    clients.forEach((client) => {
      try {
        client.observer.next(message);
      } catch (error) {
        this.logger.error(`Error sending event to client: ${error}`);
      }
    });
  }

  /**
   * Get count of active subscribers for a run
   */
  getSubscriberCount(runId: number): number {
    return this.connections.get(runId)?.length || 0;
  }

  /**
   * Get observable of all step events (for debugging/monitoring)
   */
  getStepEvents(): Observable<StepEvent> {
    return this.stepEvents$.asObservable();
  }

  /**
   * Filter step events by runId
   */
  getStepEventsForRun(runId: number): Observable<StepEvent> {
    return this.stepEvents$.pipe(filter((event) => event.runId === runId));
  }
}
