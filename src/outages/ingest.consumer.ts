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
        outageType: data.outageType as OutageType,
        reportedAt: new Date(data.reportedAt),
      });

      channel.ack(msg);
    } catch (e) {
      // 視需求：重試/丟 DLQ
      channel.nack(msg, false, false); // 不重入列 → 走 DLQ（需在 Rabbit 設 DLX）
    }
  }
}