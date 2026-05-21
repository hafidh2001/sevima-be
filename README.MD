# SEVIMA-BE

Built with NestJS, Fastify, Prisma, and TypeScript.

## Technology Stack & Specifications

### Core Technologies
- **NestJS**: 11.1.21
- **Fastify**: 5.x (via @nestjs/platform-fastify)
- **TypeScript**: 6.x
- **Prisma**: 6.x (ORM)
- **Node.js**: 18.20.5+ (tested with v18.20.5)
- **npm**: 10.8.2+ (tested with v10.8.2)

### Security & Performance
- **JWT**: @nestjs/jwt + passport-jwt for authentication
- **Rate Limiting**: @nestjs/throttler
- **Helmet**: @fastify/helmet
- **CORS**: @fastify/cors

### Database
- **PostgreSQL**: Primary database
- **Prisma Client**: ORM with type-safe queries
