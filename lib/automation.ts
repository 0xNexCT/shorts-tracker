import { prisma } from "./prisma";
import { getSmmConfig, placeLikeOrder, type SmmConfigRow } from "./smm";

/**
 * Evaluate SMM automation for a channel's shorts after stats refresh.
 *
 * Gate rules (per channel):
 *  - A short is only actionable once its views >= channel.autoLikeThreshold.
 *  - On first crossing the gate, place a single threshold-triggered order.
 *  - Thereafter, while its like ratio stays below the target, repeat-buy
 *    (respecting the order cooldown) until delivery catches up.
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
  if (!channel || !channel.autoLikeThreshold || channel.autoLikeThreshold <= 0) return 0;

  let placed = 0;
  for (const short of channel.shorts) {
    if (short.viewCount < channel.autoLikeThreshold) continue;

    const thresholdOrder = short.smmOrders.find((o) => o.trigger === "threshold");
    if (!thresholdOrder) {
      await placeLikeOrder({
        short,
        quantity: config.likeQuantity,
        trigger: "threshold",
        config,
      });
      placed++;
      continue;
    }

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
