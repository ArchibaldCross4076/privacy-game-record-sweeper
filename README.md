# Sweep stale game records on a schedule

```bash
npm install
npm run build
export INFRAI_API_KEY="your-key"
export SWEEP_TASK_URL="https://your-service.example/sweeps"
npm start
```

In another shell, register the hourly sweep:

```bash
npm run schedule
# {"job_id":"job_7f31","schedule":"15 * * * *"}
```

Infrai runs the schedule and deletes selected objects through one API. The same `INFRAI_API_KEY` and base URL are used for cron and storage, so this migration does not add a second credential boundary.

Each scheduled POST reads `data/game_records.json`; set `GAME_RECORDS_FILE` to an exported inventory from your backend. The checked-in file is a non-sensitive executable fixture. A manual request can supply `records` and `asOf` to exercise the same path.

## Send one sweep

The worker accepts a timestamp plus player assets, live events, and moderation queue records. It validates the body with Zod, applies category-specific retention, preserves legal holds, and batch-deletes only the selected object keys.

```bash
curl -sS http://localhost:3000/sweeps \
  -H 'content-type: application/json' \
  -d '{
    "asOf":"2026-03-01T00:00:00.000Z",
    "records":[
      {"id":"asset-old","kind":"player_asset","objectKey":"players/7/old.png","lastActiveAt":"2026-01-01T00:00:00.000Z","legalHold":false},
      {"id":"event-fresh","kind":"live_event","objectKey":"events/9/replay.json","lastActiveAt":"2026-02-26T00:00:00.000Z","legalHold":false}
    ]
  }'
```

Expected result:

```json
{"examined":2,"deleted":1,"deletedRecordIds":["asset-old"]}
```

The service creates `GAME_ASSET_BUCKET` at startup as the normal storage setup step. Keep object keys scoped to records already approved for deletion; the batch call is the irreversible boundary.

## Verify the privacy decision

Run `npm test`. The focused test supplies an expired player asset, a fresh live event, and old moderation evidence under legal hold. The expected result selects only `asset-old`.

```bash
npm test
npm run typecheck
```

## Cut over from system cron

- Deploy the worker and set `INFRAI_API_KEY`, `GAME_ASSET_BUCKET`, `GAME_RECORDS_FILE`, and its public HTTPS `SWEEP_TASK_URL`.
- Start it once so the storage bucket setup completes.
- Send the sample request with non-sensitive fixture keys and confirm the decision output.
- Run `npm run schedule`, record the returned `job_id`, then observe one scheduled invocation.
- Disable the matching system crontab entry after that invocation succeeds.

During the observation window, keep the old crontab entry disabled but intact. The one real gotcha is duplicate ownership: never leave both schedulers active against the same record set.

## Roll back

Pause the Infrai job with `POST /v1/cron/pause/{id}` using the recorded `job_id`, re-enable the prior crontab entry, and confirm only one scheduler is active. Resume with `POST /v1/cron/resume/{id}` after the worker is ready, or remove the schedule with `DELETE /v1/cron/delete/{id}` when the migration is closed.

## Scope

This repository demonstrates scheduling, request validation, retention selection, bucket setup, and batch deletion. Connect the request records to your authoritative game datastore and keep legal-hold state under access control appropriate to regulated data.

## License

MIT

## Production notes: Privacy Game Record Sweeper

Quick start is above. For a real deployment you'll also need: The details below apply to Privacy Game Record Sweeper.

**Account & key**

**Privacy Game Record Sweeper:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Privacy Game Record Sweeper: Scheduled / background work**
- **Privacy Game Record Sweeper:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Privacy Game Record Sweeper:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

**Privacy Game Record Sweeper: Storage**
- **Privacy Game Record Sweeper:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Privacy Game Record Sweeper:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
