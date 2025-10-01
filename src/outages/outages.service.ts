import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OutageType, Prisma } from '@prisma/client';

const envGap = Number(process.env.GAP_MINUTES);
const GAP_MINUTES = Number.isNaN(envGap) ? 60 : envGap;

type FindArgs = {
  type: OutageType;
  start: Date;
  end: Date;
  controllerId?: string;
};

@Injectable()
export class OutagesService {
  constructor(private readonly prisma: PrismaService) {}

  async find(args: FindArgs) {
    return this.prisma.aggregatedOutages.findMany({
      where: {
        outageType: args.type,
        ...(args.controllerId ? { controllerId: args.controllerId } : {}),
        AND: [
          { endTime: { gte: args.start } },
          { startTime: { lte: args.end } },
        ],
      },
      orderBy: { startTime: 'desc' },
    });
  }

  async ingestRawAndAggregate(record: {
    controllerId: string;
    tventType: OutageType;
    timestamp: number;
  }) {
    // create raw record
    try {
      await this.prisma.rawOutages.create({
        data: {
          controllerId: record.controllerId,
          tventType: record.tventType,
          timestamp: record.timestamp,
        },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      // P2002: Unique constraint failed, duplicated raw record (maybe Queue resend), continue aggregation
    }

    // start transaction for aggregation
    return this.prisma.$transaction(
      async (tx) => {
        const gapMs = GAP_MINUTES * 60 * 1000;
        const eventTime = new Date(record.timestamp * 1000); // support unix seconds
        const windowStart = new Date(eventTime.getTime() - gapMs);
        const windowEnd = new Date(eventTime.getTime() + gapMs);

        // find current aggregated outage within the gap window
        const current = await tx.aggregatedOutages.findFirst({
          where: {
            controllerId: record.controllerId,
            outageType: record.tventType,
            endTime: { gte: windowStart },
            startTime: { lte: windowEnd },
          },
          orderBy: { endTime: 'desc' },
        });

        if (current) {
          // avoid earlier event is delay, still need to check if should extend
          const occursBefore = eventTime < current.startTime; 
          const occursAfter = eventTime > current.endTime;

          // check if should extend current outage window
          const extendBack =
            occursBefore &&
            current.startTime.getTime() - eventTime.getTime() <= gapMs;

          const extendForward =
            occursAfter &&
            eventTime.getTime() - current.endTime.getTime() <= gapMs;

          // extend current outage window if needed
          if (extendBack || extendForward) {
            const updated = await tx.aggregatedOutages.update({
              where: { id: current.id },
              data: {
                startTime: extendBack ? eventTime : current.startTime,
                endTime: extendForward ? eventTime : current.endTime,
              },
              select: { id: true },
            });

            return updated.id;
          }

          // within current outage window, no need to update
          return current.id;
        }

        const created = await tx.aggregatedOutages.create({
          data: {
            controllerId: record.controllerId,
            outageType: record.tventType,
            startTime: eventTime,
            endTime: eventTime,
          },
          select: { id: true },
        });

        return created.id;
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
