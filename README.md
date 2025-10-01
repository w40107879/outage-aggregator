# Outage Aggregator

A NestJS service that ingests raw controller outage telemetry, aggregates consecutive readings into outage events, and exposes a query API.

## Architecture
- **API**: NestJS (HTTP + RabbitMQ microservice).
- **Persistence**: PostgreSQL via Prisma ORM. Raw events are stored idempotently and aggregated into `aggregated_outages`.
- **Messaging**: RabbitMQ fan-out queue `outage.raw` for asynchronous ingestion. Default gap between samples is **60 minutes** (`GAP_MINUTES`).
- **Services**: `IngestController` enqueues raw events, `IngestConsumer` performs aggregation, `OutagesController` exposes queries.

### Aggregation Highlights
- Raw events are deduplicated with a composite unique key (`controller_id`, `tvent_type`, `timestamp`).
- Consecutive events are merged when their timestamps are within the configured gap, regardless of arrival order.
- Start and end timestamps expand backward or forward when late samples arrive.
- Queries return events whose time window overlaps the requested range.

## Getting Started
### Prerequisites
- Node.js 20+
- PNPM 9+
- Docker (for PostgreSQL and RabbitMQ)

### Setup
1. Copy the environment file and adjust if needed:
   ```bash
   cp .env.example .env
   ```
2. Start infrastructure:
   ```bash
   docker compose up -d
   ```
3. Apply the Prisma schema:
   ```bash
   pnpm prisma migrate deploy
   ```
4. Run the service (HTTP on `:3000` by default):
   ```bash
   pnpm start:dev
   ```

### Environment Variables
| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | see `.env.example` |
| `RABBITMQ_URL` | RabbitMQ URL | `amqp://guest:guest@localhost:5672` |
| `RABBITMQ_QUEUE` | Queue for raw events | `outage.raw` |
| `GAP_MINUTES` | Max gap between samples to keep an outage open | `60` |

## API
OpenAPI documentation is available in [`docs/openapi.yaml`](docs/openapi.yaml). Key endpoints:

- `POST /ingest`
  ```bash
  curl -X POST http://localhost:3000/ingest \
    -H 'Content-Type: application/json' \
    -d '{
      "controller_id": "AOT1D-25090001",
      "tvent_type": "led_outage",
      "timestamp": 1756665796
    }'
  ```
- `timestamp` accepts Unix seconds or milliseconds; values in seconds are automatically converted.
- `GET /outages`
  ```bash
  curl 'http://localhost:3000/outages?type=led_outage&start=2025-01-15T00:00:00Z&end=2025-01-16T00:00:00Z'
  ```

## Testing
- Unit tests:
  ```bash
  pnpm test
  ```

## Assumptions & Notes
- Controllers emit telemetry every 10 minutes while an outage persists; server-side processing tolerates out-of-order delivery within the configured gap.
- Duplicate raw samples can be received; they are ignored after the first successful aggregation.
- `RABBITMQ_URL` must be configured in non-development environments; the application fails fast when it is missing.
- Docker compose provides local infrastructure only; adjust credentials before deploying elsewhere.
