import { AbstractHttpAdapter } from '@nestjs/core';
import {
  StreamableFile,
  type NestApplicationOptions,
  type RequestMethod,
  type VersioningOptions,
} from '@nestjs/common';
import type { VersionValue } from '@nestjs/common/internal';
import * as HyperExpress from 'hyper-express';
import type * as uWebSockets from 'uWebSockets.js';
import {
  createJsonBodyParser,
  createUrlencodedBodyParser,
} from '../utils/body-parser.util';
import { toHyperExpressMiddleware } from '../utils/middleware.util';
import { noopNext } from '../utils/noop-next.util';
import { toHyperExpressRouteHandler } from '../utils/route-handler.util';
import { HyperExpressHttpServer } from './hyper-express-http-server';

type NestRouteHandler = Parameters<typeof toHyperExpressRouteHandler>[0];
type RouteVerb =
  | 'get'
  | 'post'
  | 'put'
  | 'delete'
  | 'patch'
  | 'head'
  | 'options';

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

  // --- Fase 2: Roteamento ---

  private routeMethod(method: RouteVerb, ...args: unknown[]): HyperExpress.Server {
    const path = args[0] as string;
    const nestHandler = args[args.length - 1] as NestRouteHandler;
    const middlewares = args.slice(1, -1) as HyperExpress.MiddlewareHandler[];
    return (
      this.instance[method] as (
        ...routeArgs: unknown[]
      ) => HyperExpress.Server
    )(path, ...middlewares, toHyperExpressRouteHandler(nestHandler));
  }

  public get(...args: unknown[]): HyperExpress.Server {
    return this.routeMethod('get', ...args);
  }

  public post(...args: unknown[]): HyperExpress.Server {
    return this.routeMethod('post', ...args);
  }

  public put(...args: unknown[]): HyperExpress.Server {
    return this.routeMethod('put', ...args);
  }

  public delete(...args: unknown[]): HyperExpress.Server {
    return this.routeMethod('delete', ...args);
  }

  public patch(...args: unknown[]): HyperExpress.Server {
    return this.routeMethod('patch', ...args);
  }

  public head(...args: unknown[]): HyperExpress.Server {
    return this.routeMethod('head', ...args);
  }

  public options(...args: unknown[]): HyperExpress.Server {
    return this.routeMethod('options', ...args);
  }

  public all(...args: unknown[]): HyperExpress.Server {
    const path = args[0] as string;
    const nestHandler = args[args.length - 1] as NestRouteHandler;
    return this.instance.any(path, toHyperExpressRouteHandler(nestHandler));
  }

  public use(...args: unknown[]): HyperExpress.Server {
    const wrappedArgs = args.map((arg) =>
      typeof arg === 'function'
        ? toHyperExpressMiddleware(
            arg as Parameters<typeof toHyperExpressMiddleware>[0],
          )
        : arg,
    );
    return (
      this.instance.use as (...useArgs: unknown[]) => HyperExpress.Server
    )(...wrappedArgs);
  }

  // --- Fase 3: Tradução de Request/Response ---

  public useStaticAssets(..._args: unknown[]): never {
    return notImplemented('useStaticAssets', 'Fase 3 (ver PLAN.md §6.6)');
  }

  public setViewEngine(_engine: string): never {
    return notImplemented('setViewEngine', 'Fase 3 (ver PLAN.md §6.6)');
  }

  public getRequestHostname(request: HyperExpress.Request): string {
    return request.hostname;
  }

  public getRequestMethod(request: HyperExpress.Request): string {
    return request.method;
  }

  public getRequestUrl(request: HyperExpress.Request): string {
    return request.originalUrl;
  }

  public status(
    response: HyperExpress.Response,
    statusCode: number,
  ): HyperExpress.Response {
    return response.status(statusCode);
  }

  public reply(
    response: HyperExpress.Response,
    body: unknown,
    statusCode?: number,
  ): void {
    if (statusCode !== undefined) {
      response.status(statusCode);
    }
    if (body === undefined || body === null) {
      response.send();
      return;
    }
    if (body instanceof StreamableFile) {
      this.applyStreamHeaders(response, body);
      void response.stream(body.getStream());
      return;
    }
    if (typeof body === 'object' || typeof body === 'boolean' || typeof body === 'number') {
      response.json(body);
      return;
    }
    response.send(String(body));
  }

  private applyStreamHeaders(
    response: HyperExpress.Response,
    streamable: StreamableFile,
  ): void {
    const headers = streamable.getHeaders();
    if (
      response.getHeader('Content-Type') === undefined &&
      headers.type !== undefined
    ) {
      response.setHeader('Content-Type', headers.type);
    }
    if (
      response.getHeader('Content-Disposition') === undefined &&
      headers.disposition !== undefined
    ) {
      response.setHeader('Content-Disposition', headers.disposition);
    }
    if (
      response.getHeader('Content-Length') === undefined &&
      headers.length !== undefined
    ) {
      response.setHeader('Content-Length', String(headers.length));
    }
  }

  public end(response: HyperExpress.Response, message?: string): HyperExpress.Response {
    return response.send(message);
  }

  public render(
    _response: HyperExpress.Response,
    _view: string,
    _options: unknown,
  ): unknown {
    return notImplemented('render', 'Fase 3 (ver PLAN.md §6.6)');
  }

  public redirect(
    response: HyperExpress.Response,
    statusCode: number,
    url: string,
  ): HyperExpress.Response | false {
    response.status(statusCode);
    return response.redirect(url);
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

  public isHeadersSent(response: HyperExpress.Response): boolean {
    return response.headersSent;
  }

  public getHeader(
    response: HyperExpress.Response,
    name: string,
  ): string | string[] | void {
    return response.getHeader(name);
  }

  public setHeader(
    response: HyperExpress.Response,
    name: string,
    value: string,
  ): HyperExpress.Response {
    return response.setHeader(name, value);
  }

  public appendHeader(
    response: HyperExpress.Response,
    name: string,
    value: string,
  ): HyperExpress.Response {
    return response.append(name, value);
  }

  public registerParserMiddleware(_prefix?: string, rawBody?: boolean): void {
    if (this.isParserRegistered) return;
    this.use(createJsonBodyParser(!!rawBody));
    this.use(createUrlencodedBodyParser());
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
