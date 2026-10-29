export const proofApiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/proof`;
function ownerKey() {
  const name = "agentops-proof-owner-v1";
  let key = localStorage.getItem(name);
  if (!key || !/^[a-f0-9]{64}$/.test(key)) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    localStorage.setItem(name, key);
  }
  return key;
}
export async function proofApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const response = await fetch(`${proofApiBase}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-proof-owner": ownerKey(),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed. Try again.");
  return data as T;
}
export function downloadProof(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
