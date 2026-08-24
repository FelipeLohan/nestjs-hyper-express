import { AbstractHttpAdapter } from '@nestjs/core';
import type {
  NestApplicationOptions,
  RequestMethod,
  VersioningOptions,
} from '@nestjs/common';
import type { VersionValue } from '@nestjs/common/internal';
import * as HyperExpress from 'hyper-express';
import type * as uWebSockets from 'uWebSockets.js';
import {
  createJsonBodyParser,
  createUrlencodedBodyParser,
} from '../utils/body-parser.util';
import { noopNext } from '../utils/noop-next.util';
import { HyperExpressHttpServer } from './hyper-express-http-server';

type NestNotFoundProxy = (
  req: HyperExpress.Request,
  res: HyperExpress.Response,
  next: () => void,
) => unknown;

type NestErrorProxy = (
  err: unknown,
  req: HyperExpress.Request,
  res: HyperExpress.Response,
  next: () => void,
) => unknown;

function notImplemented(member: string, phase: string): never {
  throw new Error(
    `HyperExpressAdapter.${member}() is not implemented yet — scheduled for ${phase} of PLAN.md.`,
  );
}

export class HyperExpressAdapter extends AbstractHttpAdapter<
  HyperExpressHttpServer,
  HyperExpress.Request,
  HyperExpress.Response
> {
  declare protected instance: HyperExpress.Server;
  private listenSocket: uWebSockets.us_listen_socket | null = null;
  private isParserRegistered = false;

  constructor(
    instanceOrOptions?:
      | HyperExpress.Server
      | HyperExpress.ServerConstructorOptions,
  ) {
    const instance =
      instanceOrOptions instanceof HyperExpress.Server
        ? instanceOrOptions
        : new HyperExpress.Server(instanceOrOptions);
    super(instance);
  }

  public getInstance<T = HyperExpress.Server>(): T {
    return this.instance as unknown as T;
  }

  public initHttpServer(_options: NestApplicationOptions): void {
    this.httpServer = new HyperExpressHttpServer();
  }

  public getHttpServer<T = HyperExpressHttpServer>(): T {
    return this.httpServer as unknown as T;
  }

  public listen(port: string | number, callback?: () => void): void;
  public listen(
    port: string | number,
    hostname: string,
    callback?: () => void,
  ): void;
  public listen(port: string | number, ...args: unknown[]): void {
    const isFirstArgTypeofFunction = typeof args[0] === 'function';
    const callback = (
      isFirstArgTypeofFunction ? args[0] : args[1]
    ) as (() => void) | undefined;
    const hostname = (
      isFirstArgTypeofFunction ? undefined : args[0]
    ) as string | undefined;

    const listenPromise = hostname
      ? this.instance.listen(Number(port), hostname)
      : this.instance.listen(Number(port));

    listenPromise
      .then((socket) => {
        this.listenSocket = socket;
        this.httpServer.markListening({
          address: hostname ?? '0.0.0.0',
          family: 'IPv4',
          port: this.instance.port,
        });
        callback?.();
      })
      .catch((err: unknown) => {
        this.httpServer.emit('error', err);
      });
  }

  public async close(): Promise<void> {
    if (!this.listenSocket) return;
    this.instance.close(this.listenSocket);
    this.listenSocket = null;
    this.httpServer.markClosed();
  }

  // --- Stubs for the remaining AbstractHttpAdapter abstract members. ---
  // Each is implemented with its own TDD cycle in Fase 2/3 of PLAN.md;
  // until then they fail loudly instead of silently misbehaving.

  public useStaticAssets(..._args: unknown[]): never {
    return notImplemented('useStaticAssets', 'Fase 3 (ver PLAN.md §6.6)');
  }

  public setViewEngine(_engine: string): never {
    return notImplemented('setViewEngine', 'Fase 3 (ver PLAN.md §6.6)');
  }

  public getRequestHostname(_request: HyperExpress.Request): string {
    return notImplemented('getRequestHostname', 'Fase 3');
  }

  public getRequestMethod(_request: HyperExpress.Request): string {
    return notImplemented('getRequestMethod', 'Fase 3');
  }

  public getRequestUrl(_request: HyperExpress.Request): string {
    return notImplemented('getRequestUrl', 'Fase 3');
  }

  public status(
    _response: HyperExpress.Response,
    _statusCode: number,
  ): unknown {
    return notImplemented('status', 'Fase 3');
  }

  public reply(
    _response: HyperExpress.Response,
    _body: unknown,
    _statusCode?: number,
  ): unknown {
    return notImplemented('reply', 'Fase 3');
  }

  public end(_response: HyperExpress.Response, _message?: string): unknown {
    return notImplemented('end', 'Fase 3');
  }

  public render(
    _response: HyperExpress.Response,
    _view: string,
    _options: unknown,
  ): unknown {
    return notImplemented('render', 'Fase 3 (ver PLAN.md §6.6)');
  }

  public redirect(
    _response: HyperExpress.Response,
    _statusCode: number,
    _url: string,
  ): unknown {
    return notImplemented('redirect', 'Fase 3');
  }

  public setErrorHandler(handler: Function, _prefix?: string): void {
    const proxy = handler as NestErrorProxy;
    this.instance.set_error_handler((request, response, error) =>
      proxy(error, request, response, noopNext),
    );
  }

  public setNotFoundHandler(handler: Function, _prefix?: string): void {
    const proxy = handler as NestNotFoundProxy;
    this.instance.set_not_found_handler((request, response) =>
      proxy(request, response, noopNext),
    );
  }

  public isHeadersSent(_response: HyperExpress.Response): boolean {
    return notImplemented('isHeadersSent', 'Fase 3');
  }

  public getHeader(_response: HyperExpress.Response, _name: string): unknown {
    return notImplemented('getHeader', 'Fase 3');
  }

  public setHeader(
    _response: HyperExpress.Response,
    _name: string,
    _value: string,
  ): unknown {
    return notImplemented('setHeader', 'Fase 3');
  }

  public appendHeader(
    _response: HyperExpress.Response,
    _name: string,
    _value: string,
  ): unknown {
    return notImplemented('appendHeader', 'Fase 3');
  }

  public registerParserMiddleware(_prefix?: string, rawBody?: boolean): void {
    if (this.isParserRegistered) return;
    this.instance.use(createJsonBodyParser(!!rawBody));
    this.instance.use(createUrlencodedBodyParser());
    this.isParserRegistered = true;
  }

  public enableCors(_options?: unknown, _prefix?: string): unknown {
    return notImplemented('enableCors', 'Fase 3 (ver PLAN.md §6.7)');
  }

  public createMiddlewareFactory(
    _requestMethod: RequestMethod,
  ): (path: string, callback: Function) => unknown {
    return notImplemented('createMiddlewareFactory', 'Fase 2 (ver PLAN.md §5.4)');
  }

  public getType(): string {
    return 'hyper-express';
  }

  public applyVersionFilter(
    _handler: Function,
    _version: VersionValue,
    _versioningOptions: VersioningOptions,
  ): (
    req: HyperExpress.Request,
    res: HyperExpress.Response,
    next: () => void,
  ) => Function {
    return notImplemented('applyVersionFilter', 'Fase 2');
  }
}
