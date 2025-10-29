# API Contracts: Health Check Endpoints

**Feature**: Walking Skeleton - Infrastructure Validation
**Date**: 2025-10-29
**Branch**: `001-walking-skeleton`
**Base Path**: `/api/health`

## Overview

This document defines the REST API contracts for health check endpoints. These endpoints validate end-to-end data flow in the walking skeleton.

---

## Endpoints

### 1. List Health Checks

**Purpose**: Retrieve all health check records ordered by most recent first

**HTTP Method**: `GET`
**Path**: `/api/health`
**Tags**: `[Health]`
**Operation ID**: `listHealthChecks`

#### Request

**Query Parameters**: None
**Headers**:
- `Content-Type`: `application/json`

**Example Request**:
```http
GET /api/health HTTP/1.1
Host: localhost:3001
Content-Type: application/json
```

#### Response

**Success (200 OK)**:

```typescript
[
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    message: "System operational",
    timestamp: "2025-10-29T12:00:00.000Z"
  },
  {
    id: "660e8400-e29b-41d4-a716-446655440001",
    message: "Manual health check",
    timestamp: "2025-10-29T11:30:00.000Z"
  }
]
```

**Empty State (200 OK)**:
```typescript
[]
```

**Response Schema** (OpenAPI):
```yaml
components:
  schemas:
    HealthCheckListResponse:
      type: array
      items:
        $ref: '#/components/schemas/HealthCheck'

    HealthCheck:
      type: object
      required:
        - id
        - message
        - timestamp
      properties:
        id:
          type: string
          format: uuid
          description: Unique identifier for the health check
          example: "550e8400-e29b-41d4-a716-446655440000"
        message:
          type: string
          minLength: 1
          maxLength: 500
          description: Health check message
          example: "System operational"
        timestamp:
          type: string
          format: date-time
          description: When the health check was created
          example: "2025-10-29T12:00:00.000Z"
```

**Error Responses**:
- `500 Internal Server Error`: Database connection failure or unexpected error

---

### 2. Create Health Check Ping

**Purpose**: Record a new health check event and validate write operations

**HTTP Method**: `POST`
**Path**: `/api/health/ping`
**Tags**: `[Health]`
**Operation ID**: `createHealthCheckPing`

#### Request

**Headers**:
- `Content-Type`: `application/json`

**Body**:
```typescript
{
  message: string  // Required, 1-500 characters
}
```

**Request Schema** (OpenAPI):
```yaml
components:
  schemas:
    CreateHealthCheckRequest:
      type: object
      required:
        - message
      properties:
        message:
          type: string
          minLength: 1
          maxLength: 500
          description: Health check message to record
          example: "Manual health check triggered"
```

**Example Request**:
```http
POST /api/health/ping HTTP/1.1
Host: localhost:3001
Content-Type: application/json

{
  "message": "Manual health check triggered"
}
```

#### Response

**Success (201 Created)**:

```typescript
{
  id: "770e8400-e29b-41d4-a716-446655440002",
  message: "Manual health check triggered",
  timestamp: "2025-10-29T12:05:00.000Z"
}
```

**Response Schema** (OpenAPI):
```yaml
components:
  schemas:
    HealthCheckResponse:
      $ref: '#/components/schemas/HealthCheck'
```

**Error Responses**:

**400 Bad Request** (Validation Failure):
```typescript
{
  error: {
    code: "VALIDATION_ERROR",
    message: "Request validation failed",
    errors: [
      {
        field: "message",
        code: "too_small",
        message: "Message cannot be empty"
      }
    ]
  }
}
```

**Error Response Schema** (OpenAPI):
```yaml
components:
  schemas:
    ValidationErrorResponse:
      type: object
      required:
        - error
      properties:
        error:
          type: object
          required:
            - code
            - message
            - errors
          properties:
            code:
              type: string
              description: Machine-readable error code
              example: "VALIDATION_ERROR"
            message:
              type: string
              description: Human-readable error summary
              example: "Request validation failed"
            errors:
              type: array
              description: Field-level validation errors
              items:
                type: object
                properties:
                  field:
                    type: string
                    example: "message"
                  code:
                    type: string
                    example: "too_small"
                  message:
                    type: string
                    example: "Message cannot be empty"
```

**404 Not Found**: Resource not found (Prisma P2025 error)
**409 Conflict**: Unique constraint violation (Prisma P2002 error)
**500 Internal Server Error**: Database write failure or unexpected error

---

## OpenAPI Specification

**Full OpenAPI Document**: Available at `/api/docs/openapi.json` (runtime-generated)

**Swagger UI**: Available at `/api/docs` (interactive documentation)

**Code-First Generation**:
- Source: Zod schemas in `packages/schemas/src/lib/health.schema.ts`
- Registration: `apps/server/src/routes/health.openapi.ts`
- Generator: `@asteasolutions/zod-to-openapi`

---

## Implementation Files

### Server Implementation

**Routes**: `apps/server/src/routes/health.ts`
```typescript
import { Router } from 'express';
import { healthController } from '../controllers/health.controller';
import { validateBody } from '../middleware/validate.middleware';
import { CreateHealthCheckRequestSchema } from '@nx-monorepo/schemas';

export const healthRouter = Router();

// GET /api/health
healthRouter.get('/', healthController.listChecks);

// POST /api/health/ping
healthRouter.post('/ping', validateBody(CreateHealthCheckRequestSchema), healthController.ping);
```

**Controllers**: `apps/server/src/controllers/health.controller.ts`
```typescript
import { Request, Response } from 'express';
import { prisma, Prisma } from '@nx-monorepo/database';

export const healthController = {
  async listChecks(_req: Request, res: Response): Promise<void> {
    try {
      const checks = await prisma.healthCheck.findMany({
        orderBy: { timestamp: 'desc' }
      });
      res.json(checks);  // Direct return, no {success: true, data: ...} wrapper
    } catch (error) {
      console.error('Error fetching health checks:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  },

  async ping(req: Request, res: Response): Promise<void> {
    try {
      const check = await prisma.healthCheck.create({
        data: { message: req.body.message }
      });
      res.status(201).json(check);  // Direct return
    } catch (e) {
      // Map Prisma errors to HTTP status codes
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          return res.status(409).json({
            error: {
              code: 'CONFLICT',
              message: 'Resource already exists'
            }
          });
        }
        if (e.code === 'P2025') {
          return res.status(404).json({
            error: {
              code: 'NOT_FOUND',
              message: 'Resource not found'
            }
          });
        }
      }
      console.error('Error creating health check:', e);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  }
};
```

**OpenAPI Registration**: `apps/server/src/routes/health.openapi.ts`
```typescript
import { registry } from '../openapi/registry';
import {
  CreateHealthCheckRequestSchema,
  HealthCheckResponseSchema,
  HealthCheckListResponseSchema
} from '@nx-monorepo/schemas';

export function registerHealthOpenApi() {
  // GET /api/health
  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Health'],
    summary: 'List all health check records',
    description: 'Retrieves all health check records ordered by most recent first',
    operationId: 'listHealthChecks',
    responses: {
      200: {
        description: 'Successful response with health check list',
        content: {
          'application/json': {
            schema: HealthCheckListResponseSchema
          }
        }
      }
    }
  });

  // POST /api/health/ping
  registry.registerPath({
    method: 'post',
    path: '/health/ping',
    tags: ['Health'],
    summary: 'Create a new health check ping',
    description: 'Records a new health check event in the database',
    operationId: 'createHealthCheckPing',
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateHealthCheckRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        description: 'Health check created successfully',
        content: {
          'application/json': {
            schema: HealthCheckResponseSchema
          }
        }
      },
      400: {
        description: 'Validation error'
      }
    }
  });
}
```

### Client Implementation

**API Client**: `packages/api-client/src/lib/health.ts`
```typescript
import createClient from 'openapi-fetch';
import type { paths } from '../generated/api';

const client = createClient<paths>({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
});

export async function listHealthChecks() {
  const { data, error } = await client.GET('/api/health');
  if (error) throw new Error('Failed to fetch health checks');
  return data;  // Returns array directly: HealthCheck[]
}

export async function createHealthCheckPing(message: string) {
  const { data, error } = await client.POST('/api/health/ping', {
    body: { message }
  });
  if (error) throw new Error('Failed to create health check');
  return data;  // Returns object directly: HealthCheck
}
```

---

## Testing Strategy

### Unit Tests
- Zod schema validation (packages/schemas)
- Individual controller functions with mocked Prisma

### Integration Tests
- Full request/response cycle using supertest
- Real database operations (test database)
- Validation middleware behavior

### E2E Tests
- Playwright tests from web UI
- Full stack: browser → Next.js → API → database
- User journey: view list + create ping

---

## Security Considerations

1. **Input Validation**: All requests validated via Zod schemas
2. **SQL Injection**: Prevented by Prisma parameterized queries
3. **XSS**: Frontend escapes all user-provided content
4. **Rate Limiting**: Not implemented for Phase 1 (walking skeleton)
5. **Authentication**: Not required (public health check endpoint)

**Future Enhancements**:
- Add rate limiting (prevent abuse)
- Add authentication for write operations
- Add request logging/audit trail

---

## Performance Characteristics

**Expected Latency**:
- GET /api/health: < 100ms (simple SELECT with ORDER BY)
- POST /api/health/ping: < 150ms (single INSERT)

**Scalability**:
- Phase 1: No pagination (acceptable for ~50-100 records)
- Future: Add cursor-based pagination for > 1000 records

**Database Load**:
- Read: 1 SELECT query with ORDER BY
- Write: 1 INSERT query
- No complex joins or aggregations

---

## Related Documentation

- **Data Model**: `specs/001-walking-skeleton/data-model.md`
- **Research**: `specs/001-walking-skeleton/research.md` (Error Handling Standards)
- **OpenAPI Spec**: `/api/docs/openapi.json` (runtime-generated)
- **Swagger UI**: `/api/docs` (interactive documentation)
