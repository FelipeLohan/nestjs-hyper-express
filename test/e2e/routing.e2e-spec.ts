import { Test } from '@nestjs/testing';
import {
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HyperExpressAdapter } from '../../src';

@Controller('users')
class UsersController {
  @Get(':id')
  findOne(@Param('id') id: string) {
    return { method: 'GET', id };
  }

  @Post()
  create() {
    return { method: 'POST' };
  }

  @Put(':id')
  update(@Param('id') id: string) {
    return { method: 'PUT', id };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return { method: 'DELETE', id };
  }

  @Patch(':id')
  patch(@Param('id') id: string) {
    return { method: 'PATCH', id };
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

    const port = (app.getHttpAdapter().getInstance() as { port: number })
      .port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users/:id resolve o parâmetro de rota', async () => {
    const response = await request(baseUrl).get('/users/42').expect(200);
    expect(response.body).toEqual({ method: 'GET', id: '42' });
  });

  it('POST /users executa o handler de criação', async () => {
    const response = await request(baseUrl).post('/users').expect(201);
    expect(response.body).toEqual({ method: 'POST' });
  });

  it('PUT /users/:id executa o handler de atualização', async () => {
    const response = await request(baseUrl).put('/users/7').expect(200);
    expect(response.body).toEqual({ method: 'PUT', id: '7' });
  });

  it('DELETE /users/:id executa o handler de remoção', async () => {
    const response = await request(baseUrl).delete('/users/7').expect(200);
    expect(response.body).toEqual({ method: 'DELETE', id: '7' });
  });

  it('PATCH /users/:id executa o handler de patch', async () => {
    const response = await request(baseUrl).patch('/users/7').expect(200);
    expect(response.body).toEqual({ method: 'PATCH', id: '7' });
  });

  it('rota inexistente retorna 404', async () => {
    await request(baseUrl).get('/does-not-exist').expect(404);
  });
});
