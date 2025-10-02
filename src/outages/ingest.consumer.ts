import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { OutagesService } from './outages.service';
import { OutageType } from '@prisma/client';

@Controller()
export class IngestConsumer {
  constructor(private readonly outageService: OutagesService) {}

  @EventPattern('ingest')
  async handleIngest(@Payload() data: any, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const msg = context.getMessage();

    try {
      await this.outageService.ingestRawAndAggregate({
        controllerId: data.controllerId,
        tventType: data.tventType as OutageType,
        timestamp: data.timestamp,
      });

      channel.ack(msg);
    } catch (e) {
      // don't requeue message
      channel.nack(msg, false, false);
    }
  }
}
