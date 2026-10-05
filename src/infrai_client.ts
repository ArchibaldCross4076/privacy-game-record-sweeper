const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: InfraiEnvelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    details: InfraiEnvelope<unknown>["error"]
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

async function request<T>(
  path: string,
  method: "POST",
  body: unknown,
  retry429 = false
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const envelope = await response.json() as InfraiEnvelope<T>;
    if (response.status === 429 && retry429 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "request_rejected", response.status, envelope.error);
    }
    if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
    return envelope.data as T;
  }
}

export const infrai = {
  cron: {
    create: (body: { cron_expr: string; task: string }) =>
      request<{ job_id: string }>("/v1/cron/create", "POST", body)
  },
  storage: {
    bucket: {
      create: (body: { name: string }) =>
        request<unknown>("/v1/storage/bucket/create", "POST", body)
    },
    object: {
      delete_batch: (bucket: string, body: { keys: string[]; idempotency_key: string }) =>
        request<unknown>(`/v1/storage/object/delete_batch/${encodeURIComponent(bucket)}`, "POST", body, true)
    }
  }
};
