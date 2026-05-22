import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

interface ErrorResponse {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  details?: string;
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        const msg = responseObj.message;
        if (typeof msg === 'string') {
          message = msg;
        } else if (Array.isArray(msg)) {
          message = msg.join(', ');
        }
        code = (responseObj.error as string) || 'HTTP_EXCEPTION';
      }

      if (status === HttpStatus.BAD_REQUEST) {
        code = 'VALIDATION_ERROR';
      }
    } else if (exception instanceof SyntaxError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid JSON payload';
      code = 'JSON_PARSE_ERROR';
      details = exception.message;
    } else if (exception instanceof PayloadTooLargeException) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      message = 'Request payload too large';
      code = 'PAYLOAD_TOO_LARGE';
    } else if (exception instanceof Error) {
      message = this.sanitizeErrorMessage(exception.message);
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      error: HttpStatus[status] || 'Error',
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: request?.url || '/',
    };

    response.status(status).send(errorResponse);
  }

  private sanitizeErrorMessage(message: string): string {
    if (message.includes('Unexpected token') || message.includes('JSON.parse')) {
      return 'Malformed JSON in request body';
    }
    if (message.includes(' Unexpected end')) {
      return 'Request body is incomplete';
    }
    return message.length > 200 ? message.substring(0, 200) + '...' : message;
  }
}
