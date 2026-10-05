import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { infrai, InfraiError } from "./infrai_client.js";
import { gameRecordSchema, selectStaleRecords } from "./stale_record_policy.js";

const sweepRequestSchema = z.object({
  asOf: z.string().datetime().optional(),
  records: z.array(gameRecordSchema).max(500).optional()
}).strict();

const recordFileSchema = z.array(gameRecordSchema).max(500);

const bucket = process.env.GAME_ASSET_BUCKET ?? "game-retention-records";

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length === 0 ? {} : JSON.parse(text);
}

function deletionKey(keys: string[], asOf: string): string {
  return createHash("sha256").update(`${asOf}\n${keys.join("\n")}`).digest("hex");
}

type SweepInput = { asOf: string; records: z.infer<typeof recordFileSchema> };

async function resolveSweepInput(request: z.infer<typeof sweepRequestSchema>): Promise<SweepInput> {
  const records = request.records ?? recordFileSchema.parse(JSON.parse(
    await readFile(process.env.GAME_RECORDS_FILE ?? "data/game_records.json", "utf8")
  ));
  return { asOf: request.asOf ?? new Date().toISOString(), records };
}

export async function runSweep(input: SweepInput) {
  const stale = selectStaleRecords(input.records, new Date(input.asOf));
  const keys = stale.map((record) => record.objectKey).sort();

  if (keys.length > 0) {
    await infrai.storage.object.delete_batch(bucket, {
      keys,
      idempotency_key: deletionKey(keys, input.asOf)
    });
  }

  return {
    examined: input.records.length,
    deleted: keys.length,
    deletedRecordIds: stale.map((record) => record.id)
  };
}

function respond(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

export async function startWorker(): Promise<void> {
  await infrai.storage.bucket.create({ name: bucket });
  const port = Number(process.env.PORT ?? 3000);
  createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/sweeps") {
      respond(response, 404, { error: "route_not_found" });
      return;
    }
    try {
      const input = await resolveSweepInput(sweepRequestSchema.parse(await readJson(request)));
      respond(response, 200, await runSweep(input));
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        respond(response, 400, { error: "invalid_request" });
        return;
      }
      if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        respond(response, status, { error: error.code });
        return;
      }
      respond(response, 500, { error: "sweep_failed" });
    }
  }).listen(port, () => console.log(`cleanup worker listening on :${port}`));
}

if (process.argv[1]?.endsWith("cleanup_worker.js")) {
  startWorker().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
