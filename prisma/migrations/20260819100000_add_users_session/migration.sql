-- Clean slate: existing channels/shorts predate per-user isolation.
-- Early development — simply clear tracked data so every user starts empty.
DELETE FROM "shorts";
DELETE FROM "channels";

-- DropIndex
DROP INDEX "channels_handle_key";

-- DropIndex
DROP INDEX "channels_youtubeChannelId_key";

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "user_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channels_user_id_idx" ON "channels"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_user_id_youtubeChannelId_key" ON "channels"("user_id", "youtubeChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "channels_user_id_handle_key" ON "channels"("user_id", "handle");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;