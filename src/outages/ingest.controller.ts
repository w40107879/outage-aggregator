import { Body, Controller, Inject, OnModuleInit, Post } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBadRequestResponse, ApiBody, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { lastValueFrom } from 'rxjs';

import { IngestDto, IngestResponseDto } from './dto/ingest.dto';

@ApiTags('Ingestion')
@Controller('ingest')
export class IngestController implements OnModuleInit {
  constructor(@Inject('RMQ_CLIENT') private readonly client: ClientProxy) {}

  async onModuleInit() {
    await this.client.connect();
  }

  @ApiOperation({ summary: 'Enqueue a raw outage event for aggregation.' })
  @ApiBody({ description: 'Raw outage payload emitted by edge controllers.', type: IngestDto })
  @ApiCreatedResponse({
    description: 'The outage sample was accepted and queued for processing.',
    type: IngestResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed.' })
  @Post()
  async ingest(@Body() body: IngestDto) {
    await lastValueFrom(
      this.client.emit('ingest', {
        controllerId: body.controller_id,
        tventType: body.tvent_type,
        timestamp: body.timestamp,
      }),
    );

    return { ok: true, queued: true };
  }
}
