import { Test } from '@nestjs/testing';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Module,
  Post,
  Redirect,
  StreamableFile,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Readable } from 'stream';
import { HyperExpressAdapter } from '../../src';

@Controller()
class ResponseController {
  @Get('custom-header')
  @Header('X-Custom-Header', 'hyper-express')
  customHeader() {
    return { ok: true };
  }

  @Get('redirect-me')
  @Redirect('/target', 302)
  redirectMe() {
    return;
  }

  @Post('echo')
  @HttpCode(200)
  echo(@Body() body: unknown) {
    return body;
  }

  @Get('download')
  download() {
    const stream = Readable.from([Buffer.from('hello streamable')]);
    return new StreamableFile(stream, { type: 'text/plain' });
  }
}

@Module({ controllers: [ResponseController] })
class TestModule {}

describe('Request/Response translation (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleRef.createNestApplication(new HyperExpressAdapter());
    await app.init();
    await app.listen(0);

    const port = (app.getHttpAdapter().getInstance() as { port: number })
      .port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('sends a header set via @Header() in the real HTTP response', async () => {
    const response = await request(baseUrl).get('/custom-header').expect(200);
    expect(response.headers['x-custom-header']).toBe('hyper-express');
  });

  it('produces a Location header and status code via @Redirect()', async () => {
    const response = await request(baseUrl)
      .get('/redirect-me')
      .redirects(0)
      .expect(302);
    expect(response.headers.location).toBe('/target');
  });

  it('parses a JSON body into @Body()', async () => {
    const response = await request(baseUrl)
      .post('/echo')
      .send({ hello: 'world' })
      .set('Content-Type', 'application/json')
      .expect(200);
    expect(response.body).toEqual({ hello: 'world' });
  });

  it('returns 400 for an invalid JSON body', async () => {
    await request(baseUrl)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{not valid json')
      .expect(400);
  });

  it('streams a StreamableFile as the response body', async () => {
    const response = await request(baseUrl).get('/download').expect(200);
    expect(response.text).toBe('hello streamable');
    expect(response.headers['content-type']).toContain('text/plain');
  });
});
