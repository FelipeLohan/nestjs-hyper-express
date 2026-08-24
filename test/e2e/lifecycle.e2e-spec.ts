import { Test } from '@nestjs/testing';
import { Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Server } from 'hyper-express';
import { HyperExpressAdapter } from '../../src';

@Module({})
class EmptyModule {}

describe('Lifecycle (e2e)', () => {
  it('constructs an adapter wrapping a real HyperExpress.Server instance', () => {
    const adapter = new HyperExpressAdapter();

    expect(adapter.getInstance()).toBeInstanceOf(Server);
  });

  it('boots a Nest application on the adapter and closes it without ever listening', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EmptyModule],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication(
      new HyperExpressAdapter(),
    );
    await app.init();
    await expect(app.close()).resolves.not.toThrow();
  });

  it('listens on an ephemeral port and reports it via the underlying server', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EmptyModule],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication(
      new HyperExpressAdapter(),
    );
    await app.init();
    await app.listen(0);

    const instance = app.getHttpAdapter().getInstance() as Server;
    expect(instance.port).toBeGreaterThan(0);

    await app.close();
  });

  it('close() is idempotent — calling it twice does not throw', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EmptyModule],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication(
      new HyperExpressAdapter(),
    );
    await app.init();
    await app.listen(0);

    await app.close();
    await expect(app.close()).resolves.not.toThrow();
  });

  it('runs several independent apps through listen()/close() in sequence without port conflicts', async () => {
    for (let i = 0; i < 3; i++) {
      const moduleRef = await Test.createTestingModule({
        imports: [EmptyModule],
      }).compile();

      const app: INestApplication = moduleRef.createNestApplication(
        new HyperExpressAdapter(),
      );
      await app.init();
      await app.listen(0);

      const instance = app.getHttpAdapter().getInstance() as Server;
      expect(instance.port).toBeGreaterThan(0);

      await app.close();
    }
  });
});
