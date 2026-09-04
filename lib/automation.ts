import { prisma } from "./prisma";
import { getSmmConfig, placeLikeOrder, type SmmConfigRow } from "./smm";

/**
 * Evaluate SMM automation for a channel's shorts after stats refresh.
 *
 * Gate rules (per channel):
 *  - A short is only eligible once its views >= threshold (per-channel override
 *    else global default, e.g. 800).
 *  - While eligible, an order is placed only when its like ratio is below the
 *    target, respecting the order cooldown so it doesn't over-spend. It repeats
 *    every cycle until the ratio rises above the target.
 *
 * Master switch: skipped if global SMM is disabled or has no API key.
 */
export async function evaluateChannelAutomation(channelId: string): Promise<number> {
  const config = await getSmmConfig();
  if (!config.enabled || !config.apiKey) return 0;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      shorts: { include: { smmOrders: { orderBy: { createdAt: "desc" } } } },
    },
  });
  if (!channel) return 0;

  // Per-channel threshold wins; otherwise fall back to the global default.
  const threshold =
    channel.autoLikeThreshold !== null && channel.autoLikeThreshold !== undefined
      ? channel.autoLikeThreshold
      : config.defaultThreshold ?? 800;
  if (!threshold || threshold <= 0) return 0;

  let placed = 0;
  for (const short of channel.shorts) {
    if (short.viewCount < threshold) continue;
    if (!withinCooldown(short, config)) continue;

    const ratio = short.likeCount / short.viewCount;
    if (ratio * 100 < config.likeTargetRatio) {
      await placeLikeOrder({
        short,
        quantity: config.likeQuantity,
        trigger: "ratio",
        config,
      });
      placed++;
    }
  }
  return placed;
}

function withinCooldown(
  short: { smmOrders: { createdAt: Date }[] },
  config: SmmConfigRow
): boolean {
  const recent = short.smmOrders.find(
    (o) => Date.now() - o.createdAt.getTime() < config.minOrderGapMinutes * 60_000
  );
  return !recent;
}
