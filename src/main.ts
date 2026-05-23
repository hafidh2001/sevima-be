import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import fastifyHelmet from '@fastify/helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
      requestTimeout: 30000,
      bodyLimit: 10485760,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 8011);

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', '*'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const messages = errors.map((error) => {
          if (error.constraints) {
            return `${error.property}: ${Object.values(error.constraints).join(', ')}`;
          }
          // For nested validation, show children errors
          if (error.children && error.children.length > 0) {
            const childMessages = error.children.map((child) => {
              if (child.constraints) {
                return `${error.property}.${child.property}: ${Object.values(child.constraints).join(', ')}`;
              }
              // Deep nesting for array items
              if (child.children && child.children.length > 0) {
                return child.children.map((gc) => {
                  if (gc.constraints) {
                    return `${error.property}.${child.property}[${gc.property}]: ${Object.values(gc.constraints).join(', ')}`;
                  }
                  return `${error.property}.${child.property}[${gc.property}]: Unknown error`;
                }).join('; ');
              }
              return `${error.property}.${child.property}: Unknown error`;
            }).join('; ');
            return childMessages;
          }
          return `${error.property}: Validation failed`;
        }).flat();
        return new BadRequestException({
          message: messages,
          error: 'Validation Error',
        });
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());

  // Swagger Configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('FlowForge API')
    .setDescription('Multi-Tenant Workflow Orchestration Engine API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT access token',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('health', 'Health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger docs available at: http://localhost:${port}/api/docs`);
}

bootstrap();
