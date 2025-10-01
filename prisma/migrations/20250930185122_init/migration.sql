-- CreateEnum
CREATE TYPE "OutageType" AS ENUM ('panel_outage', 'temperature_outage', 'led_outage');

-- CreateTable
CREATE TABLE "raw_outages" (
    "id" BIGSERIAL NOT NULL,
    "controller_id" VARCHAR(64) NOT NULL,
    "outage_type" "OutageType" NOT NULL,
    "reported_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "raw_outages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregated_outages" (
    "id" BIGSERIAL NOT NULL,
    "controller_id" VARCHAR(64) NOT NULL,
    "outage_type" "OutageType" NOT NULL,
    "start_time" TIMESTAMPTZ(6) NOT NULL,
    "end_time" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aggregated_outages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_ct_at" ON "raw_outages"("controller_id", "outage_type", "reported_at");

-- CreateIndex
CREATE INDEX "idx_query" ON "aggregated_outages"("outage_type", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "idx_ct" ON "aggregated_outages"("controller_id", "outage_type", "start_time");
