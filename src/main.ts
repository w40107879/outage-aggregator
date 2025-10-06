import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BigIntSerializerInterceptor } from './common/interceptors/bigint-serializer.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const configService = app.get(ConfigService);
  const rabbitUrl = configService.get<string>('RABBITMQ_URL');
  const queue = configService.get<string>('RABBITMQ_QUEUE', 'outage.raw');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Outage Aggregator API')
    .setDescription('API documentation for the outage ingestion service')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    jsonDocumentUrl: 'docs/json',
  });

  if (!rabbitUrl) {
    throw new Error('RABBITMQ_URL is not configured');
  }

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue,
      queueOptions: { durable: true },
      noAck: false,
    },
  });

  await app.startAllMicroservices();
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`HTTP: http://localhost:${port}`);
  console.log(`Swagger: http://localhost:${port}/docs`);
}
bootstrap();
