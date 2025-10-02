import { OutageType, Prisma } from '@prisma/client';
import { OutagesService } from './outages.service';
import { PrismaService } from '../prisma/prisma.service';

type PrismaMock = {
  aggregatedOutages: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  rawOutages: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('OutagesService', () => {
  let service: OutagesService;
  let prismaMock: PrismaMock;

  const controllerId = 'CTRL-123';
  const outageType = 'led_outage' as OutageType;

  beforeEach(() => {
    prismaMock = {
      aggregatedOutages: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      rawOutages: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prismaMock.$transaction.mockImplementation(
      async (callback: any, _options?: unknown) =>
        callback(prismaMock as unknown as PrismaService),
    );

    service = new OutagesService(prismaMock as unknown as PrismaService);
  });

  it('finds outages matching the requested window', async () => {
    const start = new Date('2025-01-01T00:00:00.000Z');
    const end = new Date('2025-01-02T00:00:00.000Z');
    const expected = [{ id: 'agg-1' }];

    prismaMock.aggregatedOutages.findMany.mockResolvedValue(expected);

    const result = await service.find({
      type: outageType,
      start,
      end,
      controllerId,
    });

    expect(prismaMock.aggregatedOutages.findMany).toHaveBeenCalledWith({
      where: {
        outageType,
        controllerId,
        AND: [{ endTime: { gte: start } }, { startTime: { lte: end } }],
      },
      orderBy: { startTime: 'desc' },
    });
    expect(result).toBe(expected);
  });

  it('creates a new aggregated outage when none exists within the gap', async () => {
    const timestampSeconds = Math.floor(
      new Date('2025-01-01T00:00:00.000Z').getTime() / 1000,
    );
    const eventTime = new Date(timestampSeconds * 1000);

    prismaMock.rawOutages.create.mockResolvedValue(undefined);
    prismaMock.aggregatedOutages.findFirst.mockResolvedValue(null);
    prismaMock.aggregatedOutages.create.mockResolvedValue({ id: 'agg-new' });

    const result = await service.ingestRawAndAggregate({
      controllerId,
      tventType: outageType,
      timestamp: timestampSeconds,
    });

    expect(prismaMock.rawOutages.create).toHaveBeenCalledWith({
      data: {
        controllerId,
        tventType: outageType,
        timestamp: timestampSeconds,
      },
    });

    expect(prismaMock.aggregatedOutages.create).toHaveBeenCalledWith({
      data: {
        controllerId,
        outageType,
        startTime: eventTime,
        endTime: eventTime,
      },
      select: { id: true },
    });
    expect(result).toBe('agg-new');
  });

  it('extends the startTime when an earlier event falls within the gap', async () => {
    const currentEnd = new Date('2025-01-01T10:00:00.000Z');
    const earlierEvent = new Date('2025-01-01T09:15:00.000Z');
    const timestampSeconds = Math.floor(earlierEvent.getTime() / 1000);

    prismaMock.rawOutages.create.mockResolvedValue(undefined);
    prismaMock.aggregatedOutages.findFirst.mockResolvedValue({
      id: 'agg-1',
      controllerId,
      outageType,
      startTime: currentEnd,
      endTime: currentEnd,
    });
    prismaMock.aggregatedOutages.update.mockResolvedValue({ id: 'agg-1' });

    const result = await service.ingestRawAndAggregate({
      controllerId,
      tventType: outageType,
      timestamp: timestampSeconds,
    });

    expect(prismaMock.aggregatedOutages.update).toHaveBeenCalledWith({
      where: { id: 'agg-1' },
      data: {
        startTime: earlierEvent,
        endTime: currentEnd,
      },
      select: { id: true },
    });
    expect(result).toBe('agg-1');
  });

  it('extends the endTime when a later event falls within the gap', async () => {
    const currentStart = new Date('2025-01-01T10:00:00.000Z');
    const laterEvent = new Date('2025-01-01T10:45:00.000Z');
    const timestampSeconds = Math.floor(laterEvent.getTime() / 1000);

    prismaMock.rawOutages.create.mockResolvedValue(undefined);
    prismaMock.aggregatedOutages.findFirst.mockResolvedValue({
      id: 'agg-2',
      controllerId,
      outageType,
      startTime: currentStart,
      endTime: currentStart,
    });
    prismaMock.aggregatedOutages.update.mockResolvedValue({ id: 'agg-2' });

    const result = await service.ingestRawAndAggregate({
      controllerId,
      tventType: outageType,
      timestamp: timestampSeconds,
    });

    expect(prismaMock.aggregatedOutages.update).toHaveBeenCalledWith({
      where: { id: 'agg-2' },
      data: {
        startTime: currentStart,
        endTime: laterEvent,
      },
      select: { id: true },
    });
    expect(result).toBe('agg-2');
  });

  it('returns the existing outage id when the event is inside the window', async () => {
    const currentStart = new Date('2025-01-01T10:00:00.000Z');
    const currentEnd = new Date('2025-01-01T11:00:00.000Z');
    const insideEvent = new Date('2025-01-01T10:30:00.000Z');
    const timestampSeconds = Math.floor(insideEvent.getTime() / 1000);

    prismaMock.rawOutages.create.mockResolvedValue(undefined);
    prismaMock.aggregatedOutages.findFirst.mockResolvedValue({
      id: 'agg-3',
      controllerId,
      outageType,
      startTime: currentStart,
      endTime: currentEnd,
    });

    const result = await service.ingestRawAndAggregate({
      controllerId,
      tventType: outageType,
      timestamp: timestampSeconds,
    });

    expect(prismaMock.aggregatedOutages.update).not.toHaveBeenCalled();
    expect(result).toBe('agg-3');
  });

  it('continues aggregation when the raw outage already exists', async () => {
    const timestampSeconds = Math.floor(
      new Date('2025-01-01T12:00:00.000Z').getTime() / 1000,
    );
    const eventTime = new Date(timestampSeconds * 1000);

    prismaMock.rawOutages.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'unit-test',
      }),
    );

    prismaMock.aggregatedOutages.findFirst.mockResolvedValue(null);
    prismaMock.aggregatedOutages.create.mockResolvedValue({
      id: 'agg-duplicate',
    });

    const result = await service.ingestRawAndAggregate({
      controllerId,
      tventType: outageType,
      timestamp: timestampSeconds,
    });

    expect(prismaMock.aggregatedOutages.create).toHaveBeenCalledWith({
      data: {
        controllerId,
        outageType,
        startTime: eventTime,
        endTime: eventTime,
      },
      select: { id: true },
    });
    expect(result).toBe('agg-duplicate');
  });
});
