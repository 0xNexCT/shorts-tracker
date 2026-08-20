-- Count-based buckets (latest_count / old_count / is_monitored) are replaced by
-- a date-range based system. The app is still in development, so existing test
-- rows for shorts and their view snapshots are wiped; the old date-range
-- columns start null (equivalent to "no old videos tracked").

-- DropIndex
DROP INDEX "shorts_channel_id_is_monitored_bucket_idx";

-- Clear stale test data: snapshots first (FK to shorts), then shorts.
DELETE FROM "view_snapshots";
DELETE FROM "shorts";

-- AlterTable
ALTER TABLE "channels" DROP COLUMN "latest_count",
DROP COLUMN "old_count",
ADD COLUMN     "old_from_date" DATE,
ADD COLUMN     "old_to_date" DATE;

-- AlterTable
ALTER TABLE "shorts" DROP COLUMN "is_monitored";

-- CreateIndex
CREATE INDEX "shorts_channel_id_bucket_idx" ON "shorts"("channel_id", "bucket");