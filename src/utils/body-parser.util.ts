import { BadRequestException } from '@nestjs/common';
import type { MiddlewareHandler } from 'hyper-express';

export function createJsonBodyParser(rawBody: boolean): MiddlewareHandler {
  return async (request, _response, next) => {
    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.includes('application/json')) {
      next();
      return;
    }

    try {
      if (rawBody) {
        (request as unknown as { rawBody: Buffer }).rawBody =
          await request.buffer();
      }
      request.body = await request.json(null);
      next();
    } catch {
      next(new BadRequestException('Invalid JSON body') as unknown as Error);
    }
  };
}

export function createUrlencodedBodyParser(): MiddlewareHandler {
  return async (request, _response, next) => {
    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      next();
      return;
    }

    request.body = await request.urlencoded();
    next();
  };
}
