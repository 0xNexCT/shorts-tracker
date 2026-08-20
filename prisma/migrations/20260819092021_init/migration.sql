-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "uploadsPlaylistId" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shorts" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "viewCount" INTEGER NOT NULL,
    "likeCount" INTEGER NOT NULL,
    "commentCount" INTEGER NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shorts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_youtubeChannelId_key" ON "channels"("youtubeChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "channels_handle_key" ON "channels"("handle");

-- CreateIndex
CREATE INDEX "shorts_channel_id_idx" ON "shorts"("channel_id");

-- CreateIndex
CREATE INDEX "shorts_videoId_idx" ON "shorts"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "shorts_channel_id_videoId_key" ON "shorts"("channel_id", "videoId");

-- AddForeignKey
ALTER TABLE "shorts" ADD CONSTRAINT "shorts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
