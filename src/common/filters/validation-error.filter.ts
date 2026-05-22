import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

interface ValidationError {
  field: string;
  message: string;
  constraints?: Record<string, string>;
}

interface ErrorResponse {
  statusCode: number;
  error: string;
  code: string;
  message: string | string[];
  errors?: ValidationError[];
  timestamp: string;
  path: string;
}

@Catch(BadRequestException)
export class GlobalValidationErrorFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest();

    const exceptionResponse = exception.getResponse();

    let errors: ValidationError[] = [];
    let message: string | string[] = 'Validation failed';

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObj = exceptionResponse as Record<string, unknown>;

      if (Array.isArray(responseObj.message)) {
        message = responseObj.message;

        errors = (responseObj.message as string[]).map((msg) => {
          const match = msg.match(/^(\w+)\s/);
          return {
            field: match ? match[1] : 'unknown',
            message: msg,
          };
        });
      } else if (typeof responseObj.message === 'string') {
        message = responseObj.message;
      }
    }

    const errorResponse: ErrorResponse = {
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      code: 'VALIDATION_ERROR',
      message,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
      path: request?.url || '/',
    };

    response.status(HttpStatus.BAD_REQUEST).send(errorResponse);
  }
}
