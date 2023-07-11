import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WSAdapter } from './ws-adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WSAdapter(app));

  await app.listen(1111);
}
bootstrap();
