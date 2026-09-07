function objectKey(request) {
  const key = request.headers.get("x-r2-object-key")?.trim() || "";
  if (!key.startsWith("dialogue/voices/") || key.includes("..")) {
    return null;
  }
  return key;
}

function objectHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-length", String(object.size));
  return headers;
}

export default {
  async fetch(request, env) {
    const key = objectKey(request);
    if (!key) return new Response("Invalid dialogue voice key", { status: 400 });

    if (request.method === "HEAD") {
      const object = await env.BUCKET.head(key);
      return object
        ? new Response(null, { headers: objectHeaders(object) })
        : new Response(null, { status: 404 });
    }

    if (request.method === "PUT") {
      await env.BUCKET.put(key, request.body, {
        httpMetadata: {
          contentType: request.headers.get("content-type")
            || "application/octet-stream",
          cacheControl: request.headers.get("cache-control") || undefined,
        },
      });
      return new Response(null, { status: 201 });
    }

    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "HEAD, PUT" },
    });
  },
};
