import { toHyperExpressRouteHandler } from '../../src/utils/route-handler.util';

describe('toHyperExpressRouteHandler', () => {
  it('calls the Nest handler with (request, response, noop) from a (request, response) call', () => {
    const nestHandler = jest.fn();
    const handler = toHyperExpressRouteHandler(nestHandler);
    const fakeRequest = { marker: 'req' } as any;
    const fakeResponse = { marker: 'res' } as any;

    handler(fakeRequest, fakeResponse);

    expect(nestHandler).toHaveBeenCalledTimes(1);
    const [req, res, next] = nestHandler.mock.calls[0];
    expect(req).toBe(fakeRequest);
    expect(res).toBe(fakeResponse);
    expect(typeof next).toBe('function');
    expect(next()).toBeUndefined();
  });

  it('returns whatever the Nest handler returns', () => {
    const nestHandler = jest.fn().mockReturnValue('nest-result');
    const handler = toHyperExpressRouteHandler(nestHandler);

    const result = handler({} as any, {} as any);

    expect(result).toBe('nest-result');
  });
});
