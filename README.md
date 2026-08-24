# nestjs-hyper-express

A [Hyper-Express](https://github.com/kartikk221/hyper-express) HTTP adapter for [NestJS](https://nestjs.com/), built on top of [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) for high-throughput HTTP handling.

## Features

- Drop-in `HttpAdapter` implementation for NestJS (`NestFactory.create(AppModule, new HyperExpressAdapter())`)
- Full application lifecycle support (`listen`, `close`)
- Routing for all standard HTTP methods, including route params and wildcards
- Request/response translation compatible with NestJS decorators (`@Body`, `@Param`, `@Query`, etc.)
- Support for global and module-level middleware
- Covered by a unit and end-to-end test suite

## Requirements

- Node.js version pinned in [`.nvmrc`](./.nvmrc)
- `@nestjs/common` and `@nestjs/core` (`^10.0.0 || ^11.0.0`)
- `hyper-express` (`^6.0.0`)

## Installation

```bash
npm install nestjs-hyper-express hyper-express @nestjs/common @nestjs/core
```

`hyper-express`, `@nestjs/common` and `@nestjs/core` are peer dependencies and must be installed alongside this package.

## Quick Start

```ts
import { NestFactory } from '@nestjs/core';
import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common';
import { HyperExpressAdapter } from 'nestjs-hyper-express';

@Controller()
class AppController {
  @Get('hello')
  hello() {
    return { message: 'Hello from nestjs-hyper-express!' };
  }

  @Get('hello/:name')
  helloName(@Param('name') name: string) {
    return { message: `Hello, ${name}!` };
  }

  @Post('echo')
  echo(@Body() body: unknown) {
    return { youSent: body };
  }
}

@Module({ controllers: [AppController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new HyperExpressAdapter());
  await app.listen(3000);
  console.log('Listening on http://localhost:3000');
}

bootstrap();
```

A runnable version of this example is available at [`examples/basic-app.ts`](./examples/basic-app.ts).

## Scripts

| Script | Description |
| --- | --- |
| `npm run build` | Builds the package (CJS + ESM + type declarations) with `tsup` |
| `npm run dev` | Builds in watch mode |
| `npm test` | Runs the unit test suite |
| `npm run test:e2e` | Runs the end-to-end test suite |
| `npm run lint` | Lints and auto-fixes the codebase |

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions, testing guidelines and the pull request workflow.

## License

[MIT](./LICENSE) © Felipe Lohan Farias dos Santos
