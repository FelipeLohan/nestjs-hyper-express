import type { UserRouteHandler } from 'hyper-express';
import { noopNext } from './noop-next.util';

type NestRouteHandler = (
  req: Parameters<UserRouteHandler>[0],
  res: Parameters<UserRouteHandler>[1],
  next: () => void,
) => unknown;

/**
 * hyper-express calls the final route handler as (request, response) —
 * only middlewares receive `next`. Nest always registers handlers shaped
 * (req, res, next) => any, so this supplies the `next` hyper-express will
 * never pass.
 */
export function toHyperExpressRouteHandler(
  nestHandler: NestRouteHandler,
): UserRouteHandler {
  return (request, response) => nestHandler(request, response, noopNext);
}
