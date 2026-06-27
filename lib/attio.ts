/**
 * Minimal typed client for the Attio REST API (v2).
 * Docs: https://docs.attio.com/rest-api/overview
 *
 * Auth: Bearer ATTIO_API_KEY. Base: https://api.attio.com/v2
 */

const BASE_URL = "https://api.attio.com/v2";

/** Custom object slug for the AutoCloser deal pipeline ("deals" is reserved). */
export const DEALS_OBJECT = process.env.ATTIO_DEALS_OBJECT ?? "ac_deals";

export class AttioError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "AttioError";
  }
}

function apiKey(): string {
  const key = process.env.ATTIO_API_KEY;
  if (!key) throw new Error("ATTIO_API_KEY is not set. See README → Attio setup.");
  return key;
}

async function request<T>(
  path: string,
  init: RequestInit & { method: string },
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new AttioError(`Attio ${init.method} ${path} → ${res.status}`, res.status, body);
  }
  return body as T;
}

// --- Objects ---------------------------------------------------------------

export interface AttioObject {
  id: { object_id: string };
  api_slug: string;
  singular_noun: string;
  plural_noun: string;
}

export async function getObject(slug: string): Promise<AttioObject | null> {
  try {
    const res = await request<{ data: AttioObject }>(`/objects/${slug}`, {
      method: "GET",
    });
    return res.data;
  } catch (err) {
    if (err instanceof AttioError && (err.status === 404 || err.status === 400)) {
      return null;
    }
    throw err;
  }
}

export async function createObject(input: {
  api_slug: string;
  singular_noun: string;
  plural_noun: string;
}): Promise<AttioObject> {
  const res = await request<{ data: AttioObject }>("/objects", {
    method: "POST",
    body: JSON.stringify({ data: input }),
  });
  return res.data;
}

// --- Attributes ------------------------------------------------------------

export interface AttioAttribute {
  api_slug: string;
  type: string;
  title: string;
}

export async function listAttributes(object: string): Promise<AttioAttribute[]> {
  const res = await request<{ data: AttioAttribute[] }>(
    `/objects/${object}/attributes`,
    { method: "GET" },
  );
  return res.data;
}

export async function createAttribute(
  object: string,
  input: {
    title: string;
    api_slug: string;
    type: string;
    description?: string | null;
    is_required?: boolean;
    is_unique?: boolean;
    is_multiselect?: boolean;
    config?: Record<string, unknown>;
  },
): Promise<AttioAttribute> {
  const res = await request<{ data: AttioAttribute }>(
    `/objects/${object}/attributes`,
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          is_required: false,
          is_unique: false,
          is_multiselect: false,
          config: {},
          ...input,
          // Attio requires `description` to be a string (not null/undefined).
          description: input.description ?? input.title,
        },
      }),
    },
  );
  return res.data;
}

// --- Records ---------------------------------------------------------------

export type AttioValues = Record<string, unknown>;

export interface AttioRecord {
  id: { record_id: string };
  values: Record<string, unknown>;
}

export async function createRecord(
  object: string,
  values: AttioValues,
): Promise<AttioRecord> {
  const res = await request<{ data: AttioRecord }>(`/objects/${object}/records`, {
    method: "POST",
    body: JSON.stringify({ data: { values } }),
  });
  return res.data;
}

/** Overwrites the supplied single-value attributes on a record. */
export async function updateRecord(
  object: string,
  recordId: string,
  values: AttioValues,
): Promise<AttioRecord> {
  const res = await request<{ data: AttioRecord }>(
    `/objects/${object}/records/${recordId}`,
    { method: "PATCH", body: JSON.stringify({ data: { values } }) },
  );
  return res.data;
}

export async function queryRecords(
  object: string,
  body: { filter?: unknown; sorts?: unknown; limit?: number; offset?: number } = {},
): Promise<AttioRecord[]> {
  const res = await request<{ data: AttioRecord[] }>(
    `/objects/${object}/records/query`,
    { method: "POST", body: JSON.stringify(body) },
  );
  return res.data;
}

// --- Notes -----------------------------------------------------------------

export async function createNote(input: {
  parent_object: string;
  parent_record_id: string;
  title: string;
  format: "plaintext" | "markdown";
  content: string;
}): Promise<{ id: { note_id: string } }> {
  const res = await request<{ data: { id: { note_id: string } } }>("/notes", {
    method: "POST",
    body: JSON.stringify({ data: input }),
  });
  return res.data;
}
