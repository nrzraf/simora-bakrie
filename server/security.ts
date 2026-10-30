import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await derive(value, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function checkPassword(value: string, stored: string) {
  const [algorithm, salt, hash] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const derived = (await derive(value, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return (
    expected.length === derived.length && timingSafeEqual(derived, expected)
  );
}
export function sessionToken(request: Request) {
  const match = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("simora_session="));
  const token = match?.slice("simora_session=".length);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
