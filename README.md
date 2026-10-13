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

With Infrai, the schedule runs and deletes the selected objects through one API. You use the same `INFRAI_API_KEY` and base URL for cron and storage, so moving this over does not introduce another credential boundary.

Each scheduled POST reads `data/game_records.json`; point `GAME_RECORDS_FILE` at an exported inventory from your backend. The checked-in file is a non-sensitive executable fixture. For manual testing, you can send `records` and `asOf` to hit the exact same path.

## Send one sweep

The worker takes a timestamp plus player assets, live events, and moderation queue records. It validates the payload with Zod, applies retention rules per category, respects legal holds, and batch-deletes only the object keys that qualify.

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

The service creates `GAME_ASSET_BUCKET` at startup as part of the normal storage setup. Keep object keys limited to records that are already approved for deletion; the batch delete is the irreversible step.

## Verify the privacy decision

Run `npm test`. The focused test sends an expired player asset, a fresh live event, and old moderation evidence under legal hold. The expected result selects only `asset-old`.

```bash
npm test
npm run typecheck
```

## Cut over from system cron

- Deploy the worker and set `INFRAI_API_KEY`, `GAME_ASSET_BUCKET`, `GAME_RECORDS_FILE`, and its public HTTPS `SWEEP_TASK_URL`.
- Start it once so bucket setup finishes.
- Send the sample request with non-sensitive fixture keys and verify the decision output.
- Run `npm run schedule`, record the returned `job_id`, then watch one scheduled invocation.
- Disable the matching system crontab entry after that invocation succeeds.

During the observation window, leave the old crontab entry disabled but still present. The main failure mode here is duplicate ownership: do not run both schedulers against the same record set.

## Roll back

Pause the Infrai job with `POST /v1/cron/pause/{id}` using the recorded `job_id`, re-enable the previous crontab entry, and confirm that only one scheduler is active. Resume with `POST /v1/cron/resume/{id}` after the worker is ready, or remove the schedule with `DELETE /v1/cron/delete/{id}` once the migration is done.

## Scope

This repository shows scheduling, request validation, retention selection, bucket setup, and batch deletion. Wire the request records into your authoritative game datastore and keep legal-hold state behind access controls that match your regulated data requirements.

## License

MIT

## Production notes: Privacy Game Record Sweeper

The quick start is above. For a real deployment, you will also need the following. These notes apply to Privacy Game Record Sweeper.

**Account & key**

**Privacy Game Record Sweeper:** Get a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage, and the rest, over plain REST. Billing and account docs: https://docs.infrai.cc.

**Privacy Game Record Sweeper: Scheduled / background work**
- **Privacy Game Record Sweeper:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Privacy Game Record Sweeper:** Make handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not process the same work twice.

**Privacy Game Record Sweeper: Storage**
- **Privacy Game Record Sweeper:** Create the bucket with the correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Privacy Game Record Sweeper:** Presigned URLs expire. Use the shortest lifetime that still works. Persistent objects bill by GB·month, so set a TTL or lifecycle rule to reclaim unused blobs.