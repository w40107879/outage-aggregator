# Outage Aggregator

A NestJS service that ingests raw controller outage telemetry, aggregates consecutive readings into outage events, and exposes a query API.

## Architecture

- **API**: NestJS (HTTP + RabbitMQ microservice).
- **Persistence**: PostgreSQL via Prisma ORM. Raw events are stored idempotently and aggregated into `aggregated_outages`.
- **Messaging**: RabbitMQ fan-out queue `outage.raw` for asynchronous ingestion. Default gap between samples is **60 minutes** (`GAP_MINUTES`).

#### Why RabbitMQ?

Controller readings can arrive in bursts or late relative to one another, so the service pushes them into RabbitMQ rather than processing them inline on the HTTP thread. This queue smooths out ingest spikes, lets the API respond quickly, and enables the consumer (`IngestConsumer`) to retry transient failures without losing data. It also keeps the door open for additional producers or consumers to be added later (for example, analytics or alerting pipelines) without reshaping the API surface.
- **Services**: `IngestController` enqueues raw events, `IngestConsumer` performs aggregation, `OutagesController` exposes queries.

### Aggregation Highlights

- Raw events are deduplicated with a composite unique key (`controller_id`, `tvent_type`, `timestamp`).
- Consecutive events are merged when their timestamps are within the configured gap, regardless of arrival order.
- Start and end timestamps expand backward or forward when late samples arrive.
- Queries return events whose time window overlaps the requested range.

## Getting Started

### Quick Start (Docker)

Use this path if you want to run the service entirely inside containers using the provided `Dockerfile`.

1. Copy and adjust environment variables if needed (Docker reads from the same file):
   ```bash
   cp .env.example .env
   ```
2. Build and start the stack:
   ```bash
   docker compose up -d
   ```
3. API and queue endpoints will be available at:
   - `http://localhost:3000` for HTTP requests
   - `localhost:5432` for PostgreSQL
   - `amqp://guest:guest@localhost:5672` for RabbitMQ

Stop the stack with `docker compose down` (add `-v` to drop the database volume).

### Local Development (PNPM)

Prefer this path if you want to iterate locally with hot reload.

1. Copy the environment file and adjust if needed:
   ```bash
   cp .env.example .env
   ```
2. Start infrastructure:
   ```bash
   docker compose up -d db rabbit
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

| Variable         | Description                                    | Default                             |
| ---------------- | ---------------------------------------------- | ----------------------------------- |
| `PORT`           | HTTP port                                      | `3000`                              |
| `DATABASE_URL`   | PostgreSQL connection string                   | see `.env.example`                  |
| `RABBITMQ_URL`   | RabbitMQ URL                                   | `amqp://guest:guest@localhost:5672` |
| `RABBITMQ_QUEUE` | Queue for raw events                           | `outage.raw`                        |
| `GAP_MINUTES`    | Max gap between samples to keep an outage open | `60`                                |

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

- Unit tests (Jest, Prisma mocked):
  ```bash
  pnpm test
  ```
- Run a specific suite (example):
  ```bash
  pnpm test src/outages/outages.service.spec.ts
  ```
- End-to-end tests (requires PostgreSQL + RabbitMQ from Docker compose):
  ```bash
  pnpm test:e2e
  ```
  The e2e suite resets `raw_outages` and `aggregated_outages` tables between cases and reruns migrations on startup, so ensure the database defined in `DATABASE_URL` is disposable for test runs.

## Assumptions & Notes

- Controllers emit telemetry every 10 minutes while an outage persists; server-side processing tolerates out-of-order delivery within the configured gap.
- Duplicate raw samples can be received; they are ignored after the first successful aggregation.
- `RABBITMQ_URL` must be configured in non-development environments; the application fails fast when it is missing.
- Docker compose provides local infrastructure only; adjust credentials before deploying elsewhere.

## Public Platform

- Render (API) — free instances spin down when idle, so the first request after downtime can take 50+ seconds.
- Neon (PostgreSQL)
- CloudAMQP (RabbitMQ)

Live Swagger docs: https://outage-aggregator.onrender.com/docs
