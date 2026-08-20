-- CreateTable
CREATE TABLE "api_usage_log" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "units_cost" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_usage_log_created_at_idx" ON "api_usage_log"("created_at");
