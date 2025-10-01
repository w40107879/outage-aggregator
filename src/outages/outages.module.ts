import { Module } from '@nestjs/common';
import { OutagesService } from './outages.service';
import { OutagesController } from './outages.controller';
import { IngestController } from './ingest.controller';
import { IngestConsumer } from './ingest.consumer';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [OutagesController, IngestController, IngestConsumer],
  providers: [
    OutagesService,
    {
      provide: 'RMQ_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('RABBITMQ_URL');
        const queue = config.get<string>('RABBITMQ_QUEUE', 'outage.raw');

        if (!url) {
          throw new Error('RABBITMQ_URL is not configured');
        }

        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [url],
            queue,
            queueOptions: { durable: true },
          },
        });
      },
    },
  ],
})
export class OutagesModule {}
