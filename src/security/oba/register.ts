const DEFAULT_API_URL = "https://api.openbotauth.org";
const REGISTER_TIMEOUT_MS = 10_000;

export async function registerPublicKey(params: {
  publicKeyPem: string;
  token: string;
  apiUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiUrl = (params.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
  const url = `${apiUrl}/keys`;

  // Convert PEM to base64 (strip headers/whitespace) for the registry API.
  const base64Key = params.publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REGISTER_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.token}`,
      },
      body: JSON.stringify({ public_key: base64Key }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body}` };
    }

    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: detail };
  } finally {
    clearTimeout(timeout);
  }
}
