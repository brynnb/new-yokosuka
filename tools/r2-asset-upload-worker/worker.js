function objectKey(request) {
  const key = request.headers.get("x-r2-object-key")?.trim() || "";
  if (!key.startsWith("shenmue/") || key.includes("..")) return null;
  return key;
}

export default {
  async fetch(request, env) {
    const key = objectKey(request);
    if (!key) return new Response("Invalid Shenmue asset key", { status: 400 });

    if (request.method === "HEAD") {
      const object = await env.BUCKET.head(key);
      if (!object) return new Response(null, { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("content-length", String(object.size));
      if (object.customMetadata?.sha256) {
        headers.set("x-r2-sha256", object.customMetadata.sha256);
      }
      return new Response(null, { headers });
    }

    if (request.method === "PUT") {
      const sha256 = request.headers.get("x-r2-sha256")?.trim();
      if (!sha256?.match(/^[a-f0-9]{64}$/)) {
        return new Response("Invalid SHA-256", { status: 400 });
      }
      await env.BUCKET.put(key, request.body, {
        sha256,
        httpMetadata: {
          contentType: request.headers.get("content-type") || "application/octet-stream",
          cacheControl: request.headers.get("cache-control") || undefined,
        },
        customMetadata: { sha256 },
      });
      return new Response(null, { status: 201 });
    }

    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "HEAD, PUT" },
    });
  },
};
