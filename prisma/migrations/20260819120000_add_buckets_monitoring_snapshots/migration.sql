-- CreateEnum
CREATE TYPE "Bucket" AS ENUM ('old', 'latest');

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "latest_count" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "old_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "shorts" ADD COLUMN     "added_to_monitoring_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "bucket" "Bucket" NOT NULL DEFAULT 'latest',
ADD COLUMN     "is_monitored" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "view_snapshots" (
    "id" TEXT NOT NULL,
    "short_id" TEXT NOT NULL,
    "view_count" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "view_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "view_snapshots_short_id_captured_at_idx" ON "view_snapshots"("short_id", "captured_at");

-- CreateIndex
CREATE INDEX "shorts_channel_id_is_monitored_bucket_idx" ON "shorts"("channel_id", "is_monitored", "bucket");

-- AddForeignKey
ALTER TABLE "view_snapshots" ADD CONSTRAINT "view_snapshots_short_id_fkey" FOREIGN KEY ("short_id") REFERENCES "shorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data backfill: honor existing channels' caps instead of waiting for the
-- first hourly pass. Keep the newest latest_count shorts per channel as
-- monitored 'latest'; older shorts are evicted (kept for history) and will be
-- greyed out in the dashboard. Legacy shorts always land in the 'latest'
-- bucket (old_count defaults to 0 for existing channels).
UPDATE "shorts"
SET "is_monitored" = false
WHERE "id" IN (
    SELECT t."id"
    FROM (
        SELECT "id",
               "channel_id",
               ROW_NUMBER() OVER (
                   PARTITION BY "channel_id"
                   ORDER BY "published_at" DESC, "id" ASC
               ) AS rn
        FROM "shorts"
    ) t
    JOIN "channels" c ON c."id" = t."channel_id"
    WHERE t.rn > c."latest_count"
);