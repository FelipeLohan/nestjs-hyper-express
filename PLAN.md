# PLAN.md — nestjs-hyper-express

> Plano de implementação de um `HttpAdapter` do NestJS para o framework
> `hyper-express` (uWebSockets.js). Este documento é o resultado da
> investigação do código-fonte clonado em `./nest` (NestJS) e `./hyper-express`,
> e guia a implementação em `./nestjs-hyper-express`.

**Fontes investigadas:**
- `nest/packages/core/adapters/http-adapter.ts` — `AbstractHttpAdapter`
- `nest/packages/common/interfaces/http/http-server.interface.ts` — `HttpServer`
- `nest/packages/platform-fastify/adapters/fastify-adapter.ts` — `FastifyAdapter`
- `nest/packages/platform-express/adapters/express-adapter.ts` — `ExpressAdapter`
- `hyper-express/types/components/Server.d.ts` — `Server`
- `hyper-express/types/components/router/Router.d.ts` — `Router`
- `hyper-express/types/components/http/Request.d.ts` — `Request`
- `hyper-express/types/components/http/Response.d.ts` — `Response`
- `hyper-express/types/components/middleware/MiddlewareHandler.d.ts` / `MiddlewareNext.d.ts`

> **Rulings registradas durante a execução da Fase 1** (decisões tomadas ao
> vivo, via TDD, quando a realidade do runtime divergiu do plano original):
> 1. `getHttpServer()` não pode devolver o `TemplatedApp` cru — precisa de um
>    shim `EventEmitter`-based, senão `app.listen()` quebra para todo mundo,
>    não só para quem usa Socket.IO. Ver §1, item 1, e §4.2.
> 2. `registerParserMiddleware()`, `setErrorHandler()` e `setNotFoundHandler()`
>    não são opcionais/adiáveis para a Fase 3 como o plano original supunha —
>    `NestApplication.init()` os chama incondicionalmente
>    (`registerRouterHooks`/`registerParserMiddleware`), mesmo para uma
>    aplicação vazia. Implementados já na Fase 1 para o ciclo de vida básico
>    (`app.init()`) funcionar. Ver §4 (revisado).

---

## 1. Visão Geral da Arquitetura

`hyper-express` é estruturalmente mais parecido com o **Fastify** do que com o
Express: a classe `Server` **é** o roteador (`Server extends Router`) e o
próprio servidor HTTP nativo (não existe um `http.Server` do Node por baixo —
é uWebSockets.js). Isso impõe três decisões arquiteturais que moldam todo o
adapter:

1. **`TServer` não é um `net.Server` — e isso quebra `app.listen()` se não for
   compensado.** Em `ExpressAdapter`, `initHttpServer()` cria um `http.Server`
   via `http.createServer(instance)`. Em `hyper-express` não existe esse
   conceito — o "servidor" já existe na própria instância (`Server.uws_instance`,
   um `uWebSockets.TemplatedApp`).
   **Correção descoberta durante a implementação da Fase 1 (via teste E2E):**
   `NestApplication.listen()`/`getUrl()`, em `@nestjs/core/nest-application.js`,
   tratam `httpAdapter.getHttpServer()` como um `net.Server` de verdade —
   chamam `.once('error', ...)`, `.removeListener(...)` e `.address()`
   **diretamente** sobre o valor retornado. `uWebSockets.TemplatedApp` não é
   um `EventEmitter` e não tem `.address()`, então devolver
   `this.instance.uws_instance` faz `app.listen()` (a API mais usada de toda a
   aplicação Nest) explodir com `TypeError: this.httpServer.once is not a
   function`. Isso não é uma limitação de borda (como Socket.IO, §8) — é o
   caminho principal.
   **Solução implementada:** um shim `HyperExpressHttpServer` (`src/adapter/
   hyper-express-http-server.ts`), que estende `EventEmitter` e expõe
   `.address(): {address, family, port} | null`, atualizado pelo adapter:
   - `initHttpServer()` cria o shim e o atribui a `this.httpServer`.
   - `listen()`, ao resolver a Promise de `instance.listen()`, chama
     `httpServer.markListening({address, family: 'IPv4', port:
     instance.port})` **antes** de invocar o `callback` (Nest lê
     `.address()` de dentro do callback) e emite `'error'` no shim em caso de
     falha (em vez de lançar dentro do `.catch`, que só geraria uma rejeição
     não tratada).
   - `close()` chama `httpServer.markClosed()`.
   - `TServer` do `AbstractHttpAdapter<TServer,...>` portanto é
     `HyperExpressHttpServer`, não `uWebSockets.TemplatedApp`.
   - `this.instance` (herdado de `AbstractHttpAdapter`) continua sendo a
     instância de `HyperExpress.Server` — inalterado.
   - O socket de escuta (`uWebSockets.us_listen_socket`), necessário para
     `close()`, só existe **depois** que `listen()` resolve — guardado num
     campo privado (`this.listenSocket`), não no shim.
   - O shim resolve `app.listen()`/`app.getUrl()`; **não** resolve a limitação
     de integrações que esperam literalmente um `http.Server` do Node (ex.:
     anexar Socket.IO) — essa continua documentada em §8.

2. **Handlers de rota não recebem `next`.** Em Express/Fastify, tanto
   middlewares quanto o handler final recebem `(req, res, next)`. Em
   `hyper-express`, apenas **middlewares** (`MiddlewareHandler`) recebem
   `next: MiddlewareNext`; o **handler de rota final** (`UserRouteHandler`) é
   `(request, response) => unknown`, sem `next`. Como o `RouterExplorer` do
   Nest sempre invoca o handler registrado como se fosse
   `(req, res, next) => any`, o adapter precisa envolver todo handler passado
   a `get/post/put/...` para descartar/ignorar o `next` ao chamar a
   implementação do hyper-express, e fornecer um `next` no-op quando o próprio
   Nest o invocar internamente (ex.: filtros de versionamento).

3. **Não há parsing de body automático.** `hyper-express` só expõe métodos
   *lazy* em `Request` (`.json()`, `.text()`, `.urlencoded()`, `.buffer()`).
   Não existe equivalente pronto a `express.json()` neste ambiente — o
   submódulo `hyper-express-body-parser` está declarado em `.gitmodules` mas
   **não foi baixado** (pasta vazia). `registerParserMiddleware()` portanto
   precisa implementar, à mão, um middleware global que popula `request.body`
   de forma síncrona para o pipeline do Nest (que lê `req.body` diretamente
   em `@Body()`), inspecionando o header `content-type` — replicando o
   comportamento de `express.json()`/`express.urlencoded()` porém chamando os
   métodos nativos do hyper-express.

Fora isso, a arquitetura segue o mesmo molde de qualquer adapter Nest:

```
NestFactory.create(AppModule, new HyperExpressAdapter())
        │
        ▼
 HyperExpressAdapter extends AbstractHttpAdapter<
   uWebSockets.TemplatedApp,   // TServer
   HyperExpress.Request,       // TRequest
   HyperExpress.Response       // TResponse
 >
        │
        ▼
 this.instance = new HyperExpress.Server(options)   // Router + Server nativo
```

---

## 2. Mapeamento de Tipos

| Conceito Nest (`AbstractHttpAdapter<TServer,TRequest,TResponse>`) | Tipo `hyper-express` | Observação |
|---|---|---|
| `TServer` (retorno de `getHttpServer()`) | `uWebSockets.TemplatedApp` (via `instance.uws_instance`) | Não é `net.Server`; ver Limitações (§8) |
| `TRequest` | `HyperExpress.Request` (`hyper-express/types/components/http/Request`) | Estende `stream.Readable` |
| `TResponse` | `HyperExpress.Response` (`hyper-express/types/components/http/Response`) | Estende `stream.Writable` |
| `this.instance` | `HyperExpress.Server` (`extends Router`) | Único objeto: app + roteador |
| `RequestHandler<TRequest,TResponse>` do Nest `(req,res,next)=>any` | `UserRouteHandler = (request, response) => unknown` | Adapter precisa "engolir" o `next` |
| Middleware Nest `use(handler)` | `MiddlewareHandler = (request, response, next: MiddlewareNext) => unknown` | Compatível 1:1 — `MiddlewareNext = (error?: Error) => boolean` |
| `response.status(code)` | `Response.status(code: number, message?: string): this` | Chainable |
| `response.setHeader(name, value)` / `getHeader` / `appendHeader` | `Response.setHeader`/`getHeader`/`append` | Compat ExpressJS nativa |
| `response.isHeadersSent()` | `get Response.headersSent(): boolean` | — |
| `response.reply(body, statusCode?)` | `Response.json(body)` / `Response.send(body)` | Objeto → `.json()`; string/Buffer → `.send()` |
| `response.redirect(statusCode, url)` | `Response.status(code).redirect(url)` | `Response.redirect` não aceita status code; usar `.status()` antes |
| `response.end(message?)` | `Response.send(message)` (ou `.end()` herdado de `Writable`) | Validar em testes E2E (§7, Task 3.6) |
| `response.render(view, options)` | **Sem equivalente nativo** | `hyper-express` não embute view engine; ver §8 |
| `request.getRequestHostname()` | `Request.hostname` | Propriedade Express-compat |
| `request.getRequestMethod()` | `Request.method` | — |
| `request.getRequestUrl()` | `Request.originalUrl` (fallback `Request.url`) | Mesmo padrão do `ExpressAdapter` |
| `app.listen(port, host?, cb?)` | `Server.listen(port, host?, cb?): Promise<us_listen_socket>` | **Assíncrono** (Promise), diferente de Express/Fastify |
| `app.close()` | `Server.close(listen_socket?): boolean` | Exige o socket devolvido por `listen()` |
| `app.use(...)` | `Router.use(...args: (string\|Router\|MiddlewareHandler\|MiddlewareHandler[])[])` | Suporta `use(mw)` e `use(path, mw)` diretamente |
| `app.get/post/put/delete/patch/head/options/all` | `Router.get/post/put/delete/patch/head/options/any` | **`all()` → `any()`**; ambas existem como alias no hyper-express, mas mapear para `any()` reduz ambiguidade |
| Métodos WebDAV (`propfind`, `proppatch`, `mkcol`, `copy`, `move`, `lock`, `unlock`, `search`, `query`) exigidos por `AbstractHttpAdapter` | **Não existem no `Router`** | Precisam de fallback: registrar via rota nativa custom ou lançar erro descritivo — decisão em §3, Task 1.4 |
| `RequestMethod`/roteamento por prefixo | `Router.route(pattern): this` (chainable) | Não usado no MVP; documentar como extensão futura |

---

## 3. Estrutura de Arquivos do Projeto

```
nestjs-hyper-express/
├── package.json                      (já existe)
├── tsconfig.json                     (criar — strict: true)
├── src/
│   ├── index.ts                      # exports públicos
│   ├── adapter/
│   │   └── hyper-express-adapter.ts  # classe HyperExpressAdapter
│   ├── interfaces/
│   │   ├── nest-hyper-express-application.interface.ts
│   │   └── hyper-express-body-parser.interface.ts
│   └── utils/
│       ├── body-parser.util.ts       # registerParserMiddleware/useBodyParser
│       └── noop-next.util.ts         # next() no-op para handlers de rota
└── test/
    ├── jest-e2e.json                 (referenciado pelo package.json)
    └── e2e/
        ├── routing.e2e-spec.ts
        ├── request-response.e2e-spec.ts
        └── middleware.e2e-spec.ts
```

`package.json` já define `peerDependencies` (`@nestjs/common`, `@nestjs/core`,
`hyper-express`) e scripts (`build` via `tsup`, `test`/`test:e2e` via `jest`).
Falta apenas criar `tsconfig.json` e `test/jest-e2e.json`.

---

## 4. Fase 1 — Esqueleto da Classe e Setup do Servidor

**Objetivo:** classe compilável que o Nest reconhece como `HttpAdapter`
válido, cobrindo o ciclo de vida `constructor → initHttpServer → listen →
close`.

### 4.1 Esqueleto da classe

```ts
// src/adapter/hyper-express-adapter.ts
import { AbstractHttpAdapter } from '@nestjs/core';
import type { NestApplicationOptions } from '@nestjs/common';
import * as HyperExpress from 'hyper-express';
import type * as uWebSockets from 'uWebSockets.js';

export class HyperExpressAdapter extends AbstractHttpAdapter<
  uWebSockets.TemplatedApp,
  HyperExpress.Request,
  HyperExpress.Response
> {
  declare protected instance: HyperExpress.Server;
  private listenSocket: uWebSockets.us_listen_socket | null = null;

  constructor(instanceOrOptions?: HyperExpress.Server | HyperExpress.ServerConstructorOptions) {
    const instance =
      instanceOrOptions instanceof HyperExpress.Server
        ? instanceOrOptions
        : new HyperExpress.Server(instanceOrOptions);
    super(instance);
  }

  public getInstance<T = HyperExpress.Server>(): T {
    return this.instance as unknown as T;
  }
}
```

- `TServer = uWebSockets.TemplatedApp` porque é o único objeto "servidor
  nativo" disponível (via `instance.uws_instance`); ver §2.
- `instance` é redeclarada com tipo forte via `declare protected instance` —
  técnica já usada pelo `FastifyAdapter` (`declare protected readonly instance:
  TInstance`).

### 4.2 `initHttpServer` / `getHttpServer` / `setHttpServer`

```ts
public initHttpServer(_options: NestApplicationOptions): void {
  // hyper-express não expõe um net.Server — o "servidor" já é a instância.
  // Guardamos o TemplatedApp nativo para satisfazer getHttpServer().
  this.httpServer = this.instance.uws_instance;
}

public getHttpServer<T = uWebSockets.TemplatedApp>(): T {
  return this.httpServer as unknown as T;
}
```

`NestApplicationOptions.httpsOptions` é ignorado aqui de propósito: TLS em
`hyper-express` é configurado via `ServerConstructorOptions`
(`key_file_name`, `cert_file_name`, etc.) passado ao **construtor** do
`Server`, não em `listen()`. Documentar essa diferença no README público
(fora do escopo deste PLAN) — o usuário deve passar essas opções ao
instanciar `new HyperExpressAdapter({ key_file_name, cert_file_name })`.

### 4.3 `listen` / `close`

```ts
public listen(port: string | number, callback?: () => void): void;
public listen(port: string | number, hostname: string, callback?: () => void): void;
public listen(port: string | number, ...args: any[]): void {
  const isFirstArgTypeofFunction = typeof args[0] === 'function';
  const callback: (() => void) | undefined = isFirstArgTypeofFunction ? args[0] : args[1];
  const hostname: string | undefined = isFirstArgTypeofFunction ? undefined : args[0];

  const listenPromise = hostname
    ? this.instance.listen(Number(port), hostname)
    : this.instance.listen(Number(port));

  listenPromise
    .then(socket => {
      this.listenSocket = socket;
      callback?.();
    })
    .catch(err => {
      throw err;
    });
}

public async close(): Promise<void> {
  if (!this.listenSocket) return;
  this.instance.close(this.listenSocket);
  this.listenSocket = null;
}
```

- **Divergência importante de contrato:** `HttpServer.listen()` é declarado
  como síncrono/"any" no Nest, mas `Server.listen()` do hyper-express é
  **assíncrono** (retorna `Promise<us_listen_socket>`). O Nest chama
  `httpAdapter.listen(port, callback)` e depende do `callback` — não do valor
  de retorno — para saber quando o bind terminou. Por isso o wrapper acima
  resolve a Promise internamente e só then invoca `callback`, mantendo a
  assinatura síncrona esperada por `INestApplication.listen()`.
- `close()` precisa do socket devolvido por `listen()`; se o app nunca deu
  `listen()` (ex.: testes usando apenas `app.init()`), `close()` deve ser
  um no-op seguro — replicado o padrão de `FastifyAdapter.close()` que
  ignora `ERR_SERVER_NOT_RUNNING`.

### 4.4 Métodos WebDAV sem equivalente nativo

`AbstractHttpAdapter` não declara `propfind/proppatch/mkcol/copy/move/lock/
unlock/search/query` como `abstract` — eles têm implementação default que
delega para `this.instance.<method>(...args)`. Como `HyperExpress.Router` não
implementa esses métodos, a implementação herdada vai falhar em runtime
**apenas se o usuário chamar essas rotas** (uso raro/legado). Decisão:
**não sobrescrever** esses métodos na Fase 1 — deixar a implementação
default do `AbstractHttpAdapter` (que vai lançar `TypeError: this.instance.propfind is not a function` de forma clara caso alguém tente usá-los). Documentar essa limitação no README.

### 4.5 Testes de aceite da Fase 1

- [ ] `new HyperExpressAdapter()` não lança erro e `getInstance()` retorna
      uma instância de `HyperExpress.Server`.
- [ ] `NestFactory.create(AppModule, new HyperExpressAdapter())` resolve.
- [ ] `app.listen(0)` resolve e `app.getHttpServer()` retorna algo truthy.
- [ ] `app.close()` não lança erro, mesmo chamado sem `listen()` prévio.

---

## 5. Fase 2 — Implementação do Roteamento

**Objetivo:** todos os verbos HTTP exigidos por `HttpServer` funcionando via
`RouterExplorer`, respeitando a ausência de `next` nos handlers finais do
hyper-express.

### 5.1 O problema do `next` ausente

O Nest sempre registra handlers como se a assinatura fosse
`(req, res, next) => any` (ver `RequestHandler` em `http-server.interface.ts`).
Só que:
- `Router.get/post/put/...(...args: RouteSpreadableArguments)` do
  hyper-express aceita, como último argumento, um `UserRouteHandler =
  (request, response) => unknown` — **sem `next`**.
- Só os argumentos intermediários (`MiddlewareHandler`) recebem `next`.

Solução: interceptar o último argumento passado pelo Nest (o handler real) e
envelopá-lo, descartando o `next` recebido do lado do Nest e nunca repassando
`next` de volta (já que o hyper-express não vai chamá-lo de qualquer forma
para o handler final).

```ts
// src/utils/route-handler.util.ts
import type { UserRouteHandler } from 'hyper-express';

export function toHyperExpressRouteHandler(
  nestHandler: (req: any, res: any, next?: Function) => any,
): UserRouteHandler {
  return (request, response) => nestHandler(request, response, noop);
}

function noop(): void {}
```

### 5.2 `injectRoute` genérico

Todos os métodos de verbo delegam para um único helper, no mesmo espírito do
`injectRouteOptions` do `FastifyAdapter`:

```ts
private routeMethod(
  method: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options',
  ...args: any[]
): void {
  const path = args[0];
  const nestHandler = args[args.length - 1];
  const middlewares = args.slice(1, -1); // já são MiddlewareHandler[] do Nest, se houver

  this.instance[method](path, ...middlewares, toHyperExpressRouteHandler(nestHandler));
}

public get(...args: any[]) { return this.routeMethod('get', ...args); }
public post(...args: any[]) { return this.routeMethod('post', ...args); }
public put(...args: any[]) { return this.routeMethod('put', ...args); }
public delete(...args: any[]) { return this.routeMethod('delete', ...args); }
public patch(...args: any[]) { return this.routeMethod('patch', ...args); }
public head(...args: any[]) { return this.routeMethod('head', ...args); }
public options(...args: any[]) { return this.routeMethod('options', ...args); }

public all(...args: any[]) {
  const path = args[0];
  const nestHandler = args[args.length - 1];
  return this.instance.any(path, toHyperExpressRouteHandler(nestHandler));
}
```

> **Nota:** o Nest normalmente registra rota + handler apenas (sem
> middlewares intermediários passados aqui — middlewares de rota entram via
> `applyVersionFilter`/`createMiddlewareFactory`, não via `args`
> intermediários dos verbos). Validar esse pressuposto empiricamente na
> Fase 2 escrevendo um controller real com `@Get()`/`@Post()` e inspecionando
> `args` recebido em runtime (`console.log` temporário, removido antes do
> commit).

### 5.3 `use()` — middlewares globais e com prefixo

`Router.use(...args: (string | Router | MiddlewareHandler | MiddlewareHandler[])[])`
já aceita exatamente o formato que `AbstractHttpAdapter.use(...args)` recebe
(`use(handler)` e `use(path, handler)`), então **não precisa de wrapper**:

```ts
public use(...args: any[]) {
  return this.instance.use(...args);
}
```

Middlewares do hyper-express já recebem `(request, response, next)` —
compatível 1:1 com `MiddlewareHandler`/`ErrorHandler` do Nest.

### 5.4 `createMiddlewareFactory`

Usado pelo Nest para registrar middlewares de módulo (`configure(consumer)`
em `NestModule`), escopados a um método HTTP + path:

```ts
public createMiddlewareFactory(
  requestMethod: RequestMethod,
): (path: string, callback: Function) => any {
  return (path: string, callback: Function) => {
    if (requestMethod === RequestMethod.ALL) {
      return this.instance.use(path, callback as HyperExpress.MiddlewareHandler);
    }
    // hyper-express não tem "use" filtrado por método HTTP — registrar
    // a callback como rota nativa do método (perde o encadeamento com
    // outros middlewares registrados na mesma rota via app.use()).
    const method = RequestMethod[requestMethod].toLowerCase();
    return (this.instance as any)[method](path, callback);
  };
}
```

> **Risco a validar em teste E2E (Task 5, `middleware.e2e-spec.ts`):**
> `MiddlewareConsumer.forRoutes()` combinado com métodos específicos
> (`RequestMethod.GET`, etc.) — confirmar que o middleware roda *antes* do
> handler da rota e não further quebra a ordem de matching do hyper-express
> (que não é "route order sensitive" da mesma forma que Express —
> `isRouteOrderSensitive()` deve retornar `false`, como no `FastifyAdapter`,
> pois hyper-express usa uma trie de rotas, não uma stack sequencial).

### 5.5 Testes de aceite da Fase 2

- [ ] `@Get('/users/:id')` retorna 200 com o `id` correto em `req.params`.
- [ ] `@Post()`, `@Put()`, `@Delete()`, `@Patch()` funcionam.
- [ ] `@All()` (mapeado para `any()`) responde a qualquer verbo.
- [ ] Middleware global via `app.use(fn)` executa antes de todos os handlers.
- [ ] Middleware de módulo via `consumer.apply(fn).forRoutes(Controller)`
      executa apenas nas rotas esperadas.

---

## 6. Fase 3 — Tradução de Request/Response

**Objetivo:** implementar todos os métodos `abstract` restantes de
`AbstractHttpAdapter` relacionados a request/response.

### 6.1 `status` / `reply` / `end`

```ts
public status(response: HyperExpress.Response, statusCode: number): HyperExpress.Response {
  return response.status(statusCode);
}

public reply(response: HyperExpress.Response, body: any, statusCode?: number): void {
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

public end(response: HyperExpress.Response, message?: string): void {
  response.send(message);
}
```

- `StreamableFile` (usado por `@StreamableFile`/`StreamableFile` do Nest) é
  tratado como no `FastifyAdapter`/`ExpressAdapter`: cabeçalhos
  `Content-Type`/`Content-Disposition`/`Content-Length` aplicados antes do
  envio, usando `response.stream(readable)` (método nativo do hyper-express
  `Response`, que já lida com Readable streams).
- `Response.json` internamente chama `.send()` com `JSON.stringify`, então
  não é necessário fazer o `isObject(body) ? json() : send()` do jeito do
  Express — mas o comportamento de tipos primitivos (`number`, `boolean`)
  precisa ir por `.json()` também, pois `.send()` do hyper-express espera
  `string | Buffer | ArrayBuffer`, não primitivos.

### 6.2 Headers

```ts
public isHeadersSent(response: HyperExpress.Response): boolean {
  return response.headersSent;
}

public getHeader(response: HyperExpress.Response, name: string): string | string[] | void {
  return response.getHeader(name);
}

public setHeader(response: HyperExpress.Response, name: string, value: string): HyperExpress.Response {
  return response.setHeader(name, value);
}

public appendHeader(response: HyperExpress.Response, name: string, value: string): HyperExpress.Response {
  return response.append(name, value);
}
```

Todos os quatro têm equivalente nativo direto e Express-compatível em
`Response` — sem necessidade de polyfill.

### 6.3 Redirect

```ts
public redirect(response: HyperExpress.Response, statusCode: number, url: string): void {
  response.status(statusCode).redirect(url);
}
```

### 6.4 Hostname / method / url

```ts
public getRequestHostname(request: HyperExpress.Request): string {
  return request.hostname;
}

public getRequestMethod(request: HyperExpress.Request): string {
  return request.method;
}

public getRequestUrl(request: HyperExpress.Request): string {
  return request.originalUrl ?? request.url;
}
```

### 6.5 Body parsing (`registerParserMiddleware` / `useBodyParser`)

Como não há middleware pronto disponível neste ambiente (submódulo git não
baixado — ver §1, item 3), implementar manualmente, replicando o
comportamento observável de `express.json()`/`express.urlencoded()`: só
tenta parsear se o `content-type` bater, e nunca lança para o handler (erros
de parsing viram `BadRequestException`, como o `ExpressAdapter` faz via
`mapException` para `SyntaxError`).

```ts
// src/utils/body-parser.util.ts
import { BadRequestException } from '@nestjs/common';
import type { MiddlewareHandler, Request, Response } from 'hyper-express';

export function createJsonBodyParser(rawBody: boolean): MiddlewareHandler {
  return async (request: Request, response: Response, next) => {
    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.includes('application/json')) return next();
    try {
      if (rawBody) (request as any).rawBody = await request.buffer();
      request.body = await request.json(undefined); // sem default => lança em JSON inválido
      next();
    } catch (err) {
      next(new BadRequestException('Invalid JSON body') as unknown as Error);
    }
  };
}

export function createUrlencodedBodyParser(): MiddlewareHandler {
  return async (request, _response, next) => {
    const contentType = request.headers['content-type'] ?? '';
    if (!contentType.includes('application/x-www-form-urlencoded')) return next();
    request.body = await request.urlencoded();
    next();
  };
}
```

```ts
// no adapter
public registerParserMiddleware(_prefix?: string, rawBody?: boolean): void {
  this.instance.use(createJsonBodyParser(!!rawBody));
  this.instance.use(createUrlencodedBodyParser());
}
```

> **Ponto a confirmar em teste (Task 6, `request-response.e2e-spec.ts`):**
> `Request.json(undefined)` — conforme a doc do tipo, passar `default_value`
> como `undefined` mantém o comportamento padrão de retornar `{}` em vez de
> lançar (o `.d.ts` diz "default_value é `{}` por padrão... para lançar,
> passe `null`"). Ajustar para `request.json(null)` e capturar a exceção,
> validando com um teste que envia `Content-Type: application/json` e corpo
> malformado, esperando `400 Bad Request`.

### 6.6 `render` / `setViewEngine` / `useStaticAssets` — sem suporte nativo

`hyper-express` **não embute** view engine nem serve estáticos nativamente
(equivalente ao `@fastify/view`/`@fastify/static` não existe no pacote
principal — os middlewares oficiais (`hyper-express-serve-static`) são
submódulos git não disponíveis neste ambiente). Decisão para o MVP:

```ts
public setViewEngine(_engine: string): void {
  throw new Error(
    'HyperExpressAdapter.setViewEngine() is not supported: hyper-express has no built-in view engine.',
  );
}

public render(_response: HyperExpress.Response, _view: string, _options: any): void {
  throw new Error('HyperExpressAdapter.render() is not supported.');
}

public useStaticAssets(_options: unknown): void {
  throw new Error(
    'HyperExpressAdapter.useStaticAssets() is not supported out of the box. ' +
      'Register a static-file middleware manually via adapter.use(...).',
  );
}
```

Isso é uma limitação explícita e documentada (README), não um placeholder —
lançar um erro claro é preferível a uma implementação silenciosa incorreta.
Revisitar caso o time decida vendorizar/reimplementar um static-serve básico
como pacote irmão (fora do escopo deste PLAN).

### 6.7 CORS

```ts
public enableCors(options?: HyperExpress.MiddlewareHandler | Record<string, unknown>): void {
  this.instance.use((request, response, next) => {
    // Implementação mínima manual — hyper-express não depende do pacote `cors`
    // (diferente do ExpressAdapter, que usa `cors(options)` diretamente).
    applyCorsHeaders(request, response, options);
    if (request.method === 'OPTIONS') {
      response.status(204).send();
      return;
    }
    next();
  });
}
```

> Implementação completa de `applyCorsHeaders` fica fora do escopo deste
> PLAN (é lógica de negócio isolada, não uma decisão arquitetural do
> adapter) — detalhar como task própria na execução, espelhando as opções do
> pacote `cors` npm (`origin`, `methods`, `credentials`, etc.) já que
> `CorsOptions` do Nest usa esse mesmo formato.

### 6.8 `mapException`

```ts
public mapException(error: unknown): unknown {
  if (error instanceof SyntaxError) {
    return new BadRequestException(error.message);
  }
  return error;
}
```

### 6.9 Testes de aceite da Fase 3

- [ ] `res.status(201).json({...})` via controller retorna status e corpo
      corretos.
- [ ] Header customizado setado no controller aparece na resposta HTTP real.
- [ ] `@Redirect()` produz `Location` + status corretos.
- [ ] `POST` com `Content-Type: application/json` popula `@Body()`
      corretamente.
- [ ] `POST` com JSON inválido retorna `400`.
- [ ] `StreamableFile` é enviado como stream, sem carregar tudo em memória.

---

## 7. Fase 4 — Testes E2E com Supertest

### 7.1 Restrição fundamental: Supertest não pode "envelopar" a instância

Supertest normalmente aceita um `http.Server` (ou uma função
`(req,res)=>void`, que ele mesmo envolve em `http.createServer`). O
`HyperExpress.Server` **não é** nem uma coisa nem outra — é um app
uWebSockets.js que só existe de fato depois de um `listen()` bem-sucedido
(bind de socket real via C++ binding, não `net.Server`).

**Decisão:** os testes E2E sobem a aplicação Nest completa numa porta
efêmera real (`app.listen(0)`) e o Supertest se conecta via **string de URL**
(`request('http://127.0.0.1:<porta>')`), não via `request(app.getHttpServer())`
como é padrão com Express/Fastify. Isso é o mesmo padrão usado por outros
adapters de uWebSockets.js na comunidade, e é a única forma robusta dado que
não existe listener HTTP nativo do Node para interceptar.

```ts
// test/jest-e2e.json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

```ts
// test/e2e/routing.e2e-spec.ts
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Controller, Get, Module, Param } from '@nestjs/common';
import request from 'supertest';
import { HyperExpressAdapter } from '../../src';

@Controller('users')
class UsersController {
  @Get(':id')
  findOne(@Param('id') id: string) {
    return { id };
  }
}

@Module({ controllers: [UsersController] })
class TestModule {}

describe('Routing (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleRef.createNestApplication(new HyperExpressAdapter());
    await app.init();
    await app.listen(0);

    const server = app.getHttpServer();
    const address = app.getUrl ? await app.getUrl() : undefined;
    baseUrl = address ?? `http://127.0.0.1:${(app as any).getHttpAdapter().getInstance().port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users/:id retorna o parâmetro de rota', async () => {
    const response = await request(baseUrl).get('/users/42').expect(200);
    expect(response.body).toEqual({ id: '42' });
  });
});
```

> **Task própria a validar na execução:** `app.getUrl()` (helper padrão do
> Nest) depende de `getHttpServer().address()` — que não existe em
> `TemplatedApp`. Se `getUrl()` falhar, usar `Server.port` (getter nativo do
> hyper-express, `get port(): number`) para montar a URL manualmente, como
> no fallback acima. Confirmar isso empiricamente é o primeiro passo da
> Fase 4.

### 7.2 Suítes obrigatórias

| Arquivo | Cobertura |
|---|---|
| `test/e2e/routing.e2e-spec.ts` | Todos os verbos (`GET/POST/PUT/DELETE/PATCH`), route params, query params, `@All()` |
| `test/e2e/request-response.e2e-spec.ts` | Headers customizados, status codes, `@Redirect()`, `@Body()` com JSON/urlencoded, JSON inválido → 400, `StreamableFile` |
| `test/e2e/middleware.e2e-spec.ts` | `app.use()` global, `NestModule.configure()` com `forRoutes`, ordem de execução |
| `test/e2e/lifecycle.e2e-spec.ts` | `app.init()` sem `listen()`, `app.close()` idempotente, múltiplos `listen()`/`close()` em sequência (jest `beforeEach`/`afterEach`) |

### 7.3 Testes de aceite da Fase 4

- [ ] `npm run test:e2e` roda as 4 suítes acima e todas passam.
- [ ] Nenhuma suíte deixa handle aberto (jest `--detectOpenHandles` limpo —
      confirma que `close()` de fato libera a porta).
- [ ] Cobertura mínima: todo método `abstract` de `AbstractHttpAdapter` é
      exercitado por pelo menos um teste E2E (checklist cruzado com a lista
      de `abstract` em `http-adapter.ts:178-208`).

---

## 8. Limitações Conhecidas (documentar no README, não resolver neste PLAN)

1. **`getHttpServer()` não retorna um `net.Server`.** Bibliotecas que
   assumem isso (ex.: `@nestjs/platform-socket.io` anexando Socket.IO ao
   servidor HTTP do Nest) **não funcionarão** sem adaptação — hyper-express
   tem suporte nativo a WebSocket próprio (`Router.ws()`, `Router.upgrade()`)
   que é uma via alternativa, fora do escopo deste adapter HTTP.
2. **Sem view engine / static assets nativos** — `setViewEngine`, `render` e
   `useStaticAssets` lançam erro explícito (§6.6).
3. **Métodos WebDAV** (`propfind`, `mkcol`, etc.) não têm suporte no
   `Router` do hyper-express — herdam a implementação default que falha em
   runtime se usados (§4.4).
4. **`listen()` é assíncrono** por natureza no hyper-express — o wrapper do
   adapter converte isso para o padrão callback-based do Nest, mas erros de
   bind (porta em uso, etc.) são propagados via `throw` dentro do `.catch()`,
   fora da call stack síncrona original — validar que isso não quebra o
   comportamento esperado de `app.listen()` rejeitando a Promise do lado do
   Nest (task de validação na Fase 1).

---

## 9. Regras Estritas do Projeto

- **TypeScript com `strict: true`** em `tsconfig.json` (`noImplicitAny`,
  `strictNullChecks`, `strictFunctionTypes` inclusos).
- **Zero uso de `any` onde existir tipo disponível** nas libs (`@nestjs/common`,
  `@nestjs/core`, `hyper-express`). `any` só é aceitável nos pontos em que o
  próprio `AbstractHttpAdapter` do Nest declara a assinatura como `any`
  (ex.: `use(...args: any[])`) — nesses casos, tipar o corpo do método
  internamente antes de repassar ao hyper-express.
- **Clean Code:** um método público por responsabilidade; helpers privados
  (`routeMethod`, `toHyperExpressRouteHandler`, `createJsonBodyParser`, etc.)
  extraídos para `src/utils/` em vez de inline na classe do adapter.
- **Sem abstrações prematuras:** não criar uma camada de "estratégia de
  parser" plugável ou "registry de view engines" no MVP — isso é
  YAGNI enquanto não há um segundo caso de uso real.
- **Testes primeiro nas partes de tradução (Fase 3):** cada método de
  request/response ganha teste E2E antes de ser considerado "pronto" —
  alinhado à skill `test-driven-development` do time.
- **Commits pequenos e frequentes**, um por fase/sub-tarefa concluída, como
  já convencionado no fluxo de trabalho do projeto.

---

## 10. Ordem de Execução Recomendada

1. Fase 1 completa + testes de aceite (§4.5) passando.
2. Fase 2 completa + testes de aceite (§5.5) passando — dependente da Fase 1.
3. Fase 3 completa + testes de aceite (§6.9) passando — dependente da Fase 2
   (precisa de rotas registradas para exercitar request/response em E2E).
4. Fase 4: consolidar as suítes E2E que já foram nascendo incrementalmente
   nas Fases 2 e 3 dentro da estrutura final de `test/e2e/`, mais a suíte de
   lifecycle (única 100% nova nesta fase).

Cada fase deve terminar com o `npm run build` (via `tsup`) passando sem erros
de tipo antes de avançar para a próxima.
