import { EventEmitter } from 'events';

export interface HyperExpressAddressInfo {
  address: string;
  family: string;
  port: number;
}

/**
 * `NestApplication` (@nestjs/core) treats `httpAdapter.getHttpServer()` as a
 * Node `net.Server`: `app.listen()`/`app.getUrl()` call `.once('error', ...)`,
 * `.removeListener(...)` and `.address()` on it directly. hyper-express has
 * no such object — it wraps uWebSockets.js's `TemplatedApp`, which is not an
 * `EventEmitter` and has no `.address()`. This shim stands in for it; the
 * adapter updates it as the real uWS listen socket comes up or goes down.
 */
export class HyperExpressHttpServer extends EventEmitter {
  private addressInfo: HyperExpressAddressInfo | null = null;

  public address(): HyperExpressAddressInfo | null {
    return this.addressInfo;
  }

  public markListening(info: HyperExpressAddressInfo): void {
    this.addressInfo = info;
  }

  public markClosed(): void {
    this.addressInfo = null;
  }
}
