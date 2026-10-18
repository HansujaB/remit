import { lookup } from "node:dns/promises";
import { Agent, request } from "undici";
import ipaddr from "ipaddr.js";
import { HttpError } from "./config.js";

export class SourceHttpError extends HttpError {
  constructor(public sourceStatus: number, public sourceUrl: string) {
    super(422, `Source returned HTTP ${sourceStatus}. Bookmark retained.`);
  }
}

export function publicIP(address: string) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function webUrl(input: string) {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new HttpError(400, "Invalid web URL.");
  }
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port))
  )
    throw new HttpError(
      400,
      "Use a public HTTP or HTTPS link without credentials or custom ports.",
    );
  if (
    u.hostname === "localhost" ||
    u.hostname.endsWith(".localhost") ||
    u.hostname.endsWith(".local")
  )
    throw new HttpError(400, "Private network URLs are not supported.");
  return u;
}
export function canonical(input: string) {
  const u = webUrl(input);
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^utm_/i.test(key) || ["fbclid", "gclid", "igshid"].includes(key))
      u.searchParams.delete(key);
  u.searchParams.sort();
  return u.href;
}
export async function validatePublic(input: string) {
  const u = webUrl(input);
  const addresses = await lookup(u.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (!addresses.length || addresses.some((a) => !publicIP(a.address)))
    throw new HttpError(
      400,
      "Private or reserved network destinations are blocked.",
    );
  return { u, address: addresses[0] };
}
// Pin DNS resolution to the address that passed validation, including every redirect.
export async function safeFetch(
  input: string,
  maxBytes = 5 * 1024 * 1024,
): Promise<{ url: string; type: string; buffer: Buffer }> {
  let url = input;
  for (let redirects = 0; redirects < 6; redirects++) {
    const { u, address } = await validatePublic(url);
    const dispatcher = new Agent({
      connect: {
        lookup: (_hostname, options, cb) => {
          // Node's connection-family selection requests an array when all=true.
          if (options.all) cb(null, [address]);
          else cb(null, address.address, address.family);
        },
      },
    });
    try {
      const response = await request(u, {
        dispatcher,
        signal: AbortSignal.timeout(20000),
        headers: {
          "user-agent": "Remit/1.0 (personal bookmark extraction)",
          "accept-encoding": "identity",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.body.destroy();
        if (!response.headers.location)
          throw new HttpError(422, "Redirect has no destination.");
        url = new URL(String(response.headers.location), u).href;
        continue;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.body.destroy();
        throw new SourceHttpError(response.statusCode, u.href);
      }
      const type = String(response.headers["content-type"] || "").split(";")[0];
      if (
        !/^(text\/|application\/(pdf|json|xhtml\+xml)|image\/(png|jpeg|webp|gif))/.test(
          type,
        )
      ) {
        response.body.destroy();
        throw new HttpError(
          422,
          "Unsupported source format. Bookmark retained.",
        );
      }
      if (Number(response.headers["content-length"]) > maxBytes) {
        response.body.destroy();
        throw new HttpError(413, "Source exceeds extraction size limit.");
      }
      const parts: Buffer[] = [];
      let length = 0;
      for await (const part of response.body) {
        length += part.length;
        if (length > maxBytes) {
          response.body.destroy();
          throw new HttpError(413, "Source exceeds extraction size limit.");
        }
        parts.push(Buffer.from(part));
      }
      return { url: u.href, type, buffer: Buffer.concat(parts) };
    } finally {
      await dispatcher.close();
    }
  }
  throw new HttpError(422, "Too many redirects. Bookmark retained.");
}
