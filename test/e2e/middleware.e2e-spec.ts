import { Test } from '@nestjs/testing';
import {
  Controller,
  Get,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import type { INestApplication, NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'hyper-express';
import request from 'supertest';
import { HyperExpressAdapter } from '../../src';

@Controller('scoped')
class ScopedController {
  @Get()
  get() {
    return { ok: true };
  }
}

@Controller('other')
class OtherController {
  @Get()
  get() {
    return { ok: true };
  }
}

@Injectable()
class MarkerMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: () => void) {
    res.setHeader('X-Scoped-Middleware', 'applied');
    next();
  }
}

@Module({ controllers: [ScopedController, OtherController] })
class TestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MarkerMiddleware).forRoutes(ScopedController);
  }
}

describe('Middleware (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let globalMiddlewareCalls: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleRef.createNestApplication(new HyperExpressAdapter());
    globalMiddlewareCalls = 0;
    app.use((_req: Request, _res: Response, next: () => void) => {
      globalMiddlewareCalls++;
      next();
    });
    await app.init();
    await app.listen(0);

    const port = (app.getHttpAdapter().getInstance() as { port: number })
      .port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs a global middleware registered via app.use() before every route', async () => {
    globalMiddlewareCalls = 0;
    await request(baseUrl).get('/scoped').expect(200);
    await request(baseUrl).get('/other').expect(200);
    expect(globalMiddlewareCalls).toBe(2);
  });

  it('runs a module-scoped middleware only for the routes it was applied to', async () => {
    const scoped = await request(baseUrl).get('/scoped').expect(200);
    expect(scoped.headers['x-scoped-middleware']).toBe('applied');

    const other = await request(baseUrl).get('/other').expect(200);
    expect(other.headers['x-scoped-middleware']).toBeUndefined();
  });
});
