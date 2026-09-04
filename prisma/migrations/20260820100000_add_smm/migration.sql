-- AlterTable
ALTER TABLE "channels" ADD COLUMN "auto_like_threshold" INTEGER;

-- CreateTable
CREATE TABLE "smm_order_log" (
    "id" TEXT NOT NULL,
    "short_id" TEXT NOT NULL,
    "service_id" INTEGER NOT NULL,
    "panel_order_id" INTEGER,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trigger" TEXT NOT NULL,
    "start_views" INTEGER NOT NULL,
    "start_likes" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smm_order_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "smm_order_log_short_id_created_at_idx" ON "smm_order_log"("short_id", "created_at");

-- CreateIndex
CREATE INDEX "smm_order_log_status_idx" ON "smm_order_log"("status");

-- CreateIndex
CREATE INDEX "smm_order_log_trigger_idx" ON "smm_order_log"("trigger");

-- AddForeignKey
ALTER TABLE "smm_order_log" ADD CONSTRAINT "smm_order_log_short_id_fkey" FOREIGN KEY ("short_id") REFERENCES "shorts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "smm_config" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "api_url" TEXT NOT NULL DEFAULT 'https://cheapestsmmpanels.com/api/v2',
    "api_key" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "like_service_id" INTEGER NOT NULL DEFAULT 2952,
    "like_target_ratio" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    "like_quantity" INTEGER NOT NULL DEFAULT 12,
    "min_order_gap_minutes" INTEGER NOT NULL DEFAULT 60,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smm_config_pkey" PRIMARY KEY ("id")
);
