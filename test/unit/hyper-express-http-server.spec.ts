import { HyperExpressHttpServer } from '../../src/adapter/hyper-express-http-server';

describe('HyperExpressHttpServer', () => {
  it('reports no address before markListening() is called', () => {
    const server = new HyperExpressHttpServer();

    expect(server.address()).toBeNull();
  });

  it('reports the address set via markListening()', () => {
    const server = new HyperExpressHttpServer();

    server.markListening({ address: '0.0.0.0', family: 'IPv4', port: 4000 });

    expect(server.address()).toEqual({
      address: '0.0.0.0',
      family: 'IPv4',
      port: 4000,
    });
  });

  it('clears the address via markClosed()', () => {
    const server = new HyperExpressHttpServer();
    server.markListening({ address: '0.0.0.0', family: 'IPv4', port: 4000 });

    server.markClosed();

    expect(server.address()).toBeNull();
  });

  it('behaves as a Node EventEmitter for the "error" event NestApplication relies on', () => {
    const server = new HyperExpressHttpServer();
    const onError = jest.fn();
    server.once('error', onError);

    server.emit('error', new Error('bind failed'));

    expect(onError).toHaveBeenCalledWith(new Error('bind failed'));
  });
});
