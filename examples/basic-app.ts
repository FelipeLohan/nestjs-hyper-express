/**
 * Exemplo mínimo de uso do HyperExpressAdapter.
 *
 * Rodar (requer Node 18/20/22/23 — ver ../.nvmrc):
 *   npx ts-node -T examples/basic-app.ts
 *
 * Depois, em outro terminal:
 *   curl http://localhost:3000/hello
 *   curl -X POST http://localhost:3000/echo -H 'Content-Type: application/json' -d '{"msg":"oi"}'
 */
import { NestFactory } from '@nestjs/core';
import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common';
import { HyperExpressAdapter } from '../src';

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
