import { Body, Controller, Inject, OnModuleInit, Post } from '@nestjs/common';
import { IngestDto } from './dto/ingest.dto';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Controller('ingest')
export class IngestController implements OnModuleInit {
  constructor(@Inject('RMQ_CLIENT') private readonly client: ClientProxy) {}

  async onModuleInit() {
    await this.client.connect();
  }

  @Post()
  async ingest(@Body() body: IngestDto) {
    const atIso = new Date(body.timestamp).toISOString();
    await lastValueFrom(
      this.client.emit('ingest', {
        controllerId: body.controller_id,
        outageType: body.tvent_type,
        reportedAt: atIso,
      }),
    );

    return { ok: true, queued: true };
  }
}
