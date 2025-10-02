import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BigIntSerializerInterceptor } from '../src/common/interceptors/bigint-serializer.interceptor';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { from } from 'rxjs';
import { OutagesService } from '../src/outages/outages.service';

jest.setTimeout(120_000);

const execFileAsync = promisify(execFile);
const envGap = Number(process.env.GAP_MINUTES);
const GAP_MINUTES = Number.isNaN(envGap) ? 60 : envGap;
const gapMs = GAP_MINUTES * 60 * 1000; // 60 minutes
const toIso = (timestampMs: number) =>
  new Date(Math.floor(timestampMs / 1000) * 1000).toISOString();

describe('Outages API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let outagesService: OutagesService;

  const mockRmqClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
  };

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/outages';
    process.env.GAP_MINUTES = process.env.GAP_MINUTES ?? '60';

    // run migrations
    try {
      await execFileAsync('pnpm', ['prisma', 'migrate', 'deploy'], {
        env: {
          ...process.env,
        },
        cwd: process.cwd(),
      });
    } catch (error) {
      throw new Error(
        `Failed to run database migrations. Ensure PostgreSQL is reachable at ${process.env.DATABASE_URL}.\n${error}`,
      );
    }

    // create the testing module
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('RMQ_CLIENT')
      .useValue(mockRmqClient)
      .compile();

    outagesService = moduleRef.get(OutagesService);
    // mock RMQ_CLIENT
    mockRmqClient.emit.mockImplementation((pattern: string, data: any) => {
      if (pattern === 'ingest') {
        return from(
          outagesService
            .ingestRawAndAggregate({
              controllerId: data.controllerId,
              tventType: data.tventType,
              timestamp: data.timestamp,
            })
            .then(() => undefined),
        );
      }

      return from(Promise.resolve(undefined));
    });

    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new BigIntSerializerInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }

    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await prisma.rawOutages.deleteMany();
    await prisma.aggregatedOutages.deleteMany();
  });

  it('returns outages overlapping the requested window', async () => {
    const records = [
      {
        controllerId: 'CTRL-001',
        outageType: 'led_outage' as const,
        startTime: new Date('2025-01-14T23:00:00.000Z'),
        endTime: new Date('2025-01-15T00:10:00.000Z'),
      },
      {
        controllerId: 'CTRL-002',
        outageType: 'led_outage' as const,
        startTime: new Date('2025-01-15T01:00:00.000Z'),
        endTime: new Date('2025-01-15T01:20:00.000Z'),
      },
      {
        controllerId: 'CTRL-003',
        outageType: 'temperature_outage' as const,
        startTime: new Date('2025-01-15T02:00:00.000Z'),
        endTime: new Date('2025-01-15T02:40:00.000Z'),
      },
    ];

    await prisma.aggregatedOutages.createMany({ data: records });

    const response = await request(app.getHttpServer())
      .get('/outages')
      .query({
        type: 'led_outage',
        start: '2025-01-14T22:30:00.000Z',
        end: '2025-01-15T01:10:00.000Z',
      })
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(2);

    const [first, second] = response.body;
    expect(first.controllerId).toBe('CTRL-002');
    expect(second.controllerId).toBe('CTRL-001');

    const startTimes = response.body.map((item: any) =>
      new Date(item.startTime).getTime(),
    );
    expect(startTimes).toEqual([...startTimes].sort((a, b) => b - a));
  });

  it('enqueues raw outages and aggregates them', async () => {
    const controllerId = `CTRL-${randomUUID()}`;
    const timestampSeconds = Math.floor(Date.now() / 1000);

    const response = await request(app.getHttpServer())
      .post('/ingest')
      .send({
        controller_id: controllerId,
        tvent_type: 'led_outage',
        timestamp: timestampSeconds,
      })
      .expect(201);

    expect(response.body).toEqual({ ok: true, queued: true });

    const aggregated = await prisma.aggregatedOutages.findFirst({
      where: { controllerId },
    });

    expect(aggregated).toBeDefined();
    if (!aggregated) {
      return;
    }
    expect(aggregated.outageType).toBe('led_outage');
    expect(aggregated.controllerId).toBe(controllerId);
    const expectedIso = new Date(timestampSeconds * 1000).toISOString();
    expect(aggregated.startTime.toISOString()).toBe(expectedIso);
    expect(aggregated.endTime.toISOString()).toBe(expectedIso);

    const raw = await prisma.rawOutages.findFirst({ where: { controllerId } });
    expect(raw).toBeDefined();
    if (!raw) {
      return;
    }

    expect(raw.tventType).toBe('led_outage');
    expect(raw.controllerId).toBe(controllerId);
    expect(Number(raw.timestamp)).toBe(timestampSeconds);
  });

  it('creates the initial aggregated outage record', async () => {
    const controllerId = `CTRL-${randomUUID()}`;
    const baseTime = Date.now();

    await request(app.getHttpServer())
      .post('/ingest')
      .send({
        controller_id: controllerId,
        tvent_type: 'led_outage',
        timestamp: Math.floor(baseTime / 1000),
      })
      .expect(201);

    const firstAgg = await prisma.aggregatedOutages.findFirst({
      where: { controllerId },
    });
    expect(firstAgg).toBeDefined();
    if (!firstAgg) {
      return;
    }

    const expectedIso = toIso(baseTime);
    expect(firstAgg.startTime.toISOString()).toBe(expectedIso);
    expect(firstAgg.endTime.toISOString()).toBe(expectedIso);
  });

  it('extends the startTime when an earlier event arrives within the gap', async () => {
    const controllerId = `CTRL-${randomUUID()}`;
    const baseTime = Date.now();
    const earlierEvent = baseTime - gapMs + 5 * 60 * 1000; // 5 minutes before the gap limit

    await request(app.getHttpServer())
      .post('/ingest')
      .send({
        controller_id: controllerId,
        tvent_type: 'led_outage',
        timestamp: Math.floor(baseTime / 1000),
      })
      .expect(201);

    const initialAgg = await prisma.aggregatedOutages.findFirst({
      where: { controllerId },
    });
    expect(initialAgg).toBeDefined();
    if (!initialAgg) {
      return;
    }

    await request(app.getHttpServer())
      .post('/ingest')
      .send({
        controller_id: controllerId,
        tvent_type: 'led_outage',
        timestamp: Math.floor(earlierEvent / 1000),
      })
      .expect(201);

    const updatedAgg = await prisma.aggregatedOutages.findFirst({
      where: { controllerId },
    });
    expect(updatedAgg).toBeDefined();
    if (!updatedAgg) {
      return;
    }

    const expectedStartIso = toIso(earlierEvent);
    const expectedEndIso = toIso(baseTime);
    expect(updatedAgg.startTime.toISOString()).toBe(expectedStartIso);
    expect(updatedAgg.endTime.toISOString()).toBe(expectedEndIso);
  });

  it('extends the endTime when a later event arrives within the gap', async () => {
    const controllerId = `CTRL-${randomUUID()}`;
    const baseTime = Date.now();
    const laterEvent = baseTime + gapMs - 10 * 60 * 1000; // 10 minutes before the gap limit

    await request(app.getHttpServer())
      .post('/ingest')
      .send({
        controller_id: controllerId,
        tvent_type: 'led_outage',
        timestamp: Math.floor(baseTime / 1000),
      })
      .expect(201);

    const initialAgg = await prisma.aggregatedOutages.findFirst({
      where: { controllerId },
    });
    expect(initialAgg).toBeDefined();
    if (!initialAgg) {
      return;
    }

    await request(app.getHttpServer())
      .post('/ingest')
      .send({
        controller_id: controllerId,
        tvent_type: 'led_outage',
        timestamp: Math.floor(laterEvent / 1000),
      })
      .expect(201);

    const updatedAgg = await prisma.aggregatedOutages.findFirst({
      where: { controllerId },
    });
    expect(updatedAgg).toBeDefined();
    if (!updatedAgg) {
      return;
    }

    const expectedStartIso = toIso(baseTime);
    const expectedEndIso = toIso(laterEvent);
    expect(updatedAgg.startTime.toISOString()).toBe(expectedStartIso);
    expect(updatedAgg.endTime.toISOString()).toBe(expectedEndIso);
  });

  it('creates a new aggregated outage when the event falls outside the gap', async () => {
    const controllerId = `CTRL-${randomUUID()}`;
    const baseTime = Date.now();
    const outsideEvent = baseTime + gapMs + 5 * 60 * 1000; // 5 minutes after the gap limit

    await request(app.getHttpServer())
      .post('/ingest')
      .send({
        controller_id: controllerId,
        tvent_type: 'led_outage',
        timestamp: Math.floor(baseTime / 1000),
      })
      .expect(201);

    const initialAgg = await prisma.aggregatedOutages.findFirst({
      where: { controllerId },
    });
    expect(initialAgg).toBeDefined();
    if (!initialAgg) {
      return;
    }

    await request(app.getHttpServer())
      .post('/ingest')
      .send({
        controller_id: controllerId,
        tvent_type: 'led_outage',
        timestamp: Math.floor(outsideEvent / 1000),
      })
      .expect(201);

    const aggregated = await prisma.aggregatedOutages.findMany({
      where: { controllerId },
      orderBy: { startTime: 'asc' },
    });

    expect(aggregated).toHaveLength(2);
  });
});
