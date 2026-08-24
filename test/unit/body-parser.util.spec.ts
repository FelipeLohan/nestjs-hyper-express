import {
  createJsonBodyParser,
  createUrlencodedBodyParser,
} from '../../src/utils/body-parser.util';

function fakeRequest(headers: Record<string, string>) {
  return {
    headers,
    body: undefined as unknown,
    json: jest.fn(),
    urlencoded: jest.fn(),
    buffer: jest.fn(),
  };
}

describe('createJsonBodyParser', () => {
  it('populates request.body from request.json() when content-type is application/json', async () => {
    const parser = createJsonBodyParser(false);
    const request = fakeRequest({ 'content-type': 'application/json' });
    request.json.mockResolvedValue({ hello: 'world' });
    const next = jest.fn();

    await parser(request as any, {} as any, next);

    expect(request.body).toEqual({ hello: 'world' });
    expect(next).toHaveBeenCalledWith();
  });

  it('skips parsing and calls next() when content-type is not JSON', async () => {
    const parser = createJsonBodyParser(false);
    const request = fakeRequest({ 'content-type': 'text/plain' });
    const next = jest.fn();

    await parser(request as any, {} as any, next);

    expect(request.json).not.toHaveBeenCalled();
    expect(request.body).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('forwards a BadRequestException to next() when JSON parsing fails', async () => {
    const parser = createJsonBodyParser(false);
    const request = fakeRequest({ 'content-type': 'application/json' });
    request.json.mockRejectedValue(new Error('invalid json'));
    const next = jest.fn();

    await parser(request as any, {} as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const forwardedError = next.mock.calls[0][0];
    expect(forwardedError).toBeInstanceOf(Error);
    expect(forwardedError.message).toMatch(/invalid json body/i);
  });
});

describe('createUrlencodedBodyParser', () => {
  it('populates request.body from request.urlencoded() when content-type matches', async () => {
    const parser = createUrlencodedBodyParser();
    const request = fakeRequest({
      'content-type': 'application/x-www-form-urlencoded',
    });
    request.urlencoded.mockResolvedValue({ a: '1' });
    const next = jest.fn();

    await parser(request as any, {} as any, next);

    expect(request.body).toEqual({ a: '1' });
    expect(next).toHaveBeenCalledWith();
  });

  it('skips parsing and calls next() when content-type does not match', async () => {
    const parser = createUrlencodedBodyParser();
    const request = fakeRequest({ 'content-type': 'application/json' });
    const next = jest.fn();

    await parser(request as any, {} as any, next);

    expect(request.urlencoded).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});
