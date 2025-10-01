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
    outageType: OutageType;
    reportedAt: Date;
  }) {
    const gapMs = GAP_MINUTES * 60 * 1000;
    const windowStart = new Date(record.reportedAt.getTime() - gapMs);
    const windowEnd = new Date(record.reportedAt.getTime() + gapMs);

    return this.prisma.$transaction(
      async (tx) => {
        try {
          await tx.rawOutages.create({
            data: {
              controllerId: record.controllerId,
              outageType: record.outageType,
              reportedAt: record.reportedAt,
            },
          });
        } catch (error) {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== 'P2002'
          ) {
            throw error;
          }
          // duplicated raw record -> continue aggregation for idempotency
        }

        const current = await tx.aggregatedOutages.findFirst({
          where: {
            controllerId: record.controllerId,
            outageType: record.outageType,
            endTime: { gte: windowStart },
            startTime: { lte: windowEnd },
          },
          orderBy: { endTime: 'desc' },
        });

        if (current) {
          const occursBefore = record.reportedAt < current.startTime;
          const occursAfter = record.reportedAt > current.endTime;
          const extendBack =
            occursBefore &&
            current.startTime.getTime() - record.reportedAt.getTime() <= gapMs;
          const extendForward =
            occursAfter &&
            record.reportedAt.getTime() - current.endTime.getTime() <= gapMs;
          const withinWindow =
            !occursBefore && !occursAfter &&
            record.reportedAt >= current.startTime &&
            record.reportedAt <= current.endTime;

          if (extendBack || extendForward || withinWindow) {
            const updated = await tx.aggregatedOutages.update({
              where: { id: current.id },
              data: {
                startTime: extendBack ? record.reportedAt : current.startTime,
                endTime: extendForward ? record.reportedAt : current.endTime,
              },
              select: { id: true },
            });

            return updated.id;
          }
        }

        const created = await tx.aggregatedOutages.create({
          data: {
            controllerId: record.controllerId,
            outageType: record.outageType,
            startTime: record.reportedAt,
            endTime: record.reportedAt,
          },
          select: { id: true },
        });

        return created.id;
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
