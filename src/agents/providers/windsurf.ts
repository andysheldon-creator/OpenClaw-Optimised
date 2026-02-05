import fetch from "node-fetch";

export type ProviderModel = { provider: string; id: string; name?: string };

export async function discoverWindsurfModels(opts?: { url?: string; timeoutMs?: number }) {
  const url = opts?.url ?? process.env.WINDSURF_API_URL ?? "http://localhost:3000/api/models";
  const timeoutMs = opts?.timeoutMs ?? 5000;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const payload = await res.json();
    const list = Array.isArray(payload) ? payload : (payload.data ?? []);
    return list
      .map((entry: any) => ({
        provider: "windsurf",
        id: String(entry.id ?? entry.model ?? "").trim(),
        name: entry.name ?? entry.id,
      }))
      .filter((m: ProviderModel) => m.id);
  } catch (err) {
    return [];
  }
}

export default { discoverWindsurfModels };
