import { HyperExpressAdapter } from '../../src/adapter/hyper-express-adapter';

describe('HyperExpressAdapter — not-found and error handlers', () => {
  it('setNotFoundHandler wraps the Nest proxy as (request, response) => proxy(request, response, noop)', () => {
    const adapter = new HyperExpressAdapter();
    const instance = adapter.getInstance();
    const setNotFoundSpy = jest.spyOn(instance, 'set_not_found_handler');
    const nestProxy = jest.fn();

    adapter.setNotFoundHandler(nestProxy);

    expect(setNotFoundSpy).toHaveBeenCalledTimes(1);
    const registeredHandler = setNotFoundSpy.mock.calls[0][0];
    const fakeRequest = { marker: 'req' } as any;
    const fakeResponse = { marker: 'res' } as any;

    registeredHandler(fakeRequest, fakeResponse);

    expect(nestProxy).toHaveBeenCalledTimes(1);
    const [req, res, next] = nestProxy.mock.calls[0];
    expect(req).toBe(fakeRequest);
    expect(res).toBe(fakeResponse);
    expect(typeof next).toBe('function');
  });

  it('setErrorHandler reorders hyper-express (request, response, error) into Nest (error, request, response, next)', () => {
    const adapter = new HyperExpressAdapter();
    const instance = adapter.getInstance();
    const setErrorSpy = jest.spyOn(instance, 'set_error_handler');
    const nestProxy = jest.fn();

    adapter.setErrorHandler(nestProxy);

    expect(setErrorSpy).toHaveBeenCalledTimes(1);
    const registeredHandler = setErrorSpy.mock.calls[0][0];
    const fakeRequest = { marker: 'req' } as any;
    const fakeResponse = { marker: 'res' } as any;
    const fakeError = new Error('boom');

    registeredHandler(fakeRequest, fakeResponse, fakeError);

    expect(nestProxy).toHaveBeenCalledTimes(1);
    const [err, req, res, next] = nestProxy.mock.calls[0];
    expect(err).toBe(fakeError);
    expect(req).toBe(fakeRequest);
    expect(res).toBe(fakeResponse);
    expect(typeof next).toBe('function');
  });
});
