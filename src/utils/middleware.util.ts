import type { MiddlewareHandler } from 'hyper-express';

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * hyper-express special-cases middlewares declared with the `async` keyword:
 * it awaits them and then advances the chain automatically, regardless of
 * whether the middleware also called `next()` itself. Nest middlewares
 * (sync or async) always call `next()` explicitly, per the Express-style
 * contract Nest documents — so an async Nest middleware wrapped verbatim
 * gets advanced twice, and hyper-express raises
 * ERR_DOUBLE_MIDDLEWARE_EXEUCTION_DETECTED.
 *
 * This wrapper is deliberately NOT declared with `async` (so hyper-express
 * always takes its synchronous branch and never auto-advances) and instead
 * advances exactly once itself, the first time the wrapped middleware either
 * calls `next()` (sync or from inside a resolved/rejected promise) or its
 * returned promise rejects without `next()` ever being called.
 */
export function toHyperExpressMiddleware(
  nestMiddleware: (
    request: Parameters<MiddlewareHandler>[0],
    response: Parameters<MiddlewareHandler>[1],
    next: (error?: unknown) => void,
  ) => unknown,
): MiddlewareHandler {
  return (request, response, next) => {
    let settled = false;
    const settleNext = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      next(error === undefined ? undefined : toError(error));
    };

    let result: unknown;
    try {
      result = nestMiddleware(request, response, settleNext);
    } catch (error) {
      settleNext(error);
      return;
    }

    if (
      result !== null &&
      typeof result === 'object' &&
      typeof (result as PromiseLike<unknown>).then === 'function'
    ) {
      (result as PromiseLike<unknown>).then(undefined, (error: unknown) =>
        settleNext(error),
      );
    }
  };
}
