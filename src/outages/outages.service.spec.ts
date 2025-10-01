import { Prisma, OutageType } from '@prisma/client';
import { OutagesService } from './outages.service';

describe('OutagesService - ingestRawAndAggregate', () => {
  const controllerId = 'AOT1D-25090001';
  const outageType: OutageType = 'led_outage';
  let service: OutagesService;
  let prismaMock: any;

  beforeEach(() => {
    const aggregatedOutages = {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };
    const rawOutages = {
      create: jest.fn(),
    };

    prismaMock = {
      aggregatedOutages,
      rawOutages,
      $transaction: jest.fn(async (cb: any) => cb({
        aggregatedOutages,
        rawOutages,
      })),
    };

    service = new OutagesService(prismaMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('extends the end time when a record arrives after the latest sample within the gap', async () => {
    const existing = {
      id: 1n,
      controllerId,
      outageType,
      startTime: new Date('2025-01-01T10:00:00Z'),
      endTime: new Date('2025-01-01T10:20:00Z'),
    };

    prismaMock.aggregatedOutages.findFirst.mockResolvedValue(existing);
    prismaMock.aggregatedOutages.update.mockResolvedValue({ id: existing.id });
    prismaMock.rawOutages.create.mockResolvedValue({});

    const recordTime = new Date('2025-01-01T10:30:00Z');

    const id = await service.ingestRawAndAggregate({
      controllerId,
      outageType,
      reportedAt: recordTime,
    });

    expect(prismaMock.rawOutages.create).toHaveBeenCalled();
    expect(prismaMock.aggregatedOutages.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: {
        startTime: existing.startTime,
        endTime: recordTime,
      },
      select: { id: true },
    });
    expect(id).toEqual(existing.id);
  });

  it('extends the start time for out-of-order records inside the gap window', async () => {
    const existing = {
      id: 2n,
      controllerId,
      outageType,
      startTime: new Date('2025-01-01T10:20:00Z'),
      endTime: new Date('2025-01-01T10:40:00Z'),
    };

    prismaMock.aggregatedOutages.findFirst.mockResolvedValue(existing);
    prismaMock.aggregatedOutages.update.mockResolvedValue({ id: existing.id });
    prismaMock.rawOutages.create.mockResolvedValue({});

    const recordTime = new Date('2025-01-01T10:10:00Z');

    const id = await service.ingestRawAndAggregate({
      controllerId,
      outageType,
      reportedAt: recordTime,
    });

    expect(prismaMock.aggregatedOutages.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: {
        startTime: recordTime,
        endTime: existing.endTime,
      },
      select: { id: true },
    });
    expect(id).toEqual(existing.id);
  });

  it('creates a new aggregated event when the gap is exceeded', async () => {
    prismaMock.aggregatedOutages.findFirst.mockResolvedValue(null);
    prismaMock.aggregatedOutages.create.mockResolvedValue({ id: 3n });
    prismaMock.rawOutages.create.mockResolvedValue({});

    const recordTime = new Date('2025-01-01T12:00:00Z');

    const id = await service.ingestRawAndAggregate({
      controllerId,
      outageType,
      reportedAt: recordTime,
    });

    expect(prismaMock.aggregatedOutages.create).toHaveBeenCalledWith({
      data: {
        controllerId,
        outageType,
        startTime: recordTime,
        endTime: recordTime,
      },
      select: { id: true },
    });
    expect(id).toEqual(3n);
  });

  it('ignores duplicate raw records (P2002) and still returns the aggregated id', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '6.16.3',
    });

    const existing = {
      id: 4n,
      controllerId,
      outageType,
      startTime: new Date('2025-01-01T09:00:00Z'),
      endTime: new Date('2025-01-01T09:10:00Z'),
    };

    prismaMock.rawOutages.create.mockRejectedValue(error);
    prismaMock.aggregatedOutages.findFirst.mockResolvedValue(existing);
    prismaMock.aggregatedOutages.update.mockResolvedValue({ id: existing.id });

    const recordTime = existing.endTime;

    const id = await service.ingestRawAndAggregate({
      controllerId,
      outageType,
      reportedAt: recordTime,
    });

    expect(prismaMock.aggregatedOutages.update).toHaveBeenCalled();
    expect(id).toEqual(existing.id);
  });
});
