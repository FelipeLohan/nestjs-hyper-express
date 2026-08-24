import { toHyperExpressMiddleware } from '../../src/utils/middleware.util';

describe('toHyperExpressMiddleware', () => {
  it('advances exactly once when a synchronous middleware calls next()', () => {
    const nestMiddleware = jest.fn((_req, _res, next) => {
      next();
    });
    const wrapped = toHyperExpressMiddleware(nestMiddleware);
    const heNext = jest.fn();

    wrapped({} as any, {} as any, heNext);

    expect(heNext).toHaveBeenCalledTimes(1);
    expect(heNext).toHaveBeenCalledWith(undefined);
  });

  it('forwards an error when a synchronous middleware calls next(error)', () => {
    const error = new Error('sync boom');
    const nestMiddleware = jest.fn((_req, _res, next) => {
      next(error);
    });
    const wrapped = toHyperExpressMiddleware(nestMiddleware);
    const heNext = jest.fn();

    wrapped({} as any, {} as any, heNext);

    expect(heNext).toHaveBeenCalledTimes(1);
    expect(heNext).toHaveBeenCalledWith(error);
  });

  it('advances exactly once when an ASYNC middleware awaits then calls next() (the double-execution case)', async () => {
    const nestMiddleware = jest.fn(async (_req, _res, next) => {
      await Promise.resolve();
      next();
    });
    const wrapped = toHyperExpressMiddleware(nestMiddleware);
    const heNext = jest.fn();

    wrapped({} as any, {} as any, heNext);
    await new Promise((resolve) => setImmediate(resolve));

    expect(heNext).toHaveBeenCalledTimes(1);
    expect(heNext).toHaveBeenCalledWith(undefined);
  });

  it('forwards a rejection from an async middleware that never calls next() itself', async () => {
    const error = new Error('async boom');
    const nestMiddleware = jest.fn(async () => {
      throw error;
    });
    const wrapped = toHyperExpressMiddleware(nestMiddleware);
    const heNext = jest.fn();

    wrapped({} as any, {} as any, heNext);
    await new Promise((resolve) => setImmediate(resolve));

    expect(heNext).toHaveBeenCalledTimes(1);
    expect(heNext).toHaveBeenCalledWith(error);
  });

  it('forwards a synchronous throw as an error', () => {
    const error = new Error('throw boom');
    const nestMiddleware = jest.fn(() => {
      throw error;
    });
    const wrapped = toHyperExpressMiddleware(nestMiddleware);
    const heNext = jest.fn();

    wrapped({} as any, {} as any, heNext);

    expect(heNext).toHaveBeenCalledTimes(1);
    expect(heNext).toHaveBeenCalledWith(error);
  });

  it('is not itself declared as an async function, so hyper-express never auto-advances it', () => {
    const wrapped = toHyperExpressMiddleware(jest.fn());

    expect(wrapped.constructor.name).not.toBe('AsyncFunction');
  });
});
