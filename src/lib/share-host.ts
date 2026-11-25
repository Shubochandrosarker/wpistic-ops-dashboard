import { createServerFn } from "@tanstack/react-start";
import { publicAppHost } from "@/lib/public-host";

/** Published hostname first, then the request host. Same order as og:image. */
export const shareHostFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  let header = "";
  try {
    const request = getRequest();
    header = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  } catch {
    header = "";
  }
  return publicAppHost(process.env.VITE_PUBLIC_HOSTNAME) || publicAppHost(header);
});
