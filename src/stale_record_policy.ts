import { z } from "zod";

export const gameRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["player_asset", "live_event", "moderation_queue"]),
  objectKey: z.string().min(1),
  lastActiveAt: z.string().datetime(),
  legalHold: z.boolean().default(false)
}).strict();

export type GameRecord = z.infer<typeof gameRecordSchema>;

const retentionDays: Record<GameRecord["kind"], number> = {
  player_asset: 30,
  live_event: 7,
  moderation_queue: 90
};

export function selectStaleRecords(records: GameRecord[], now: Date): GameRecord[] {
  return records.filter((record) => {
    if (record.legalHold) return false;
    const ageMs = now.getTime() - new Date(record.lastActiveAt).getTime();
    return ageMs >= retentionDays[record.kind] * 24 * 60 * 60 * 1000;
  });
}
