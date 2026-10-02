const API_URL = process.env.API_URL || "http://127.0.0.1:8000";
const MAX_BODY = 2_000_000;

export async function proxy(request: Request, path: string) {
  if (!/^\/(auth|portfolios|market|analyze)(\/|$)/.test(path)) {
    return Response.json({ detail: "Ruta no encontrada." }, { status: 404 });
  }
  try {
    const headers = new Headers({ Accept: "application/json" });
    for (const key of ["content-type", "cookie", "origin"]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    let body: Uint8Array | undefined;
    if (!["GET", "HEAD"].includes(request.method) && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BODY) {
          await reader.cancel();
          return Response.json(
            { detail: "Archivo demasiado grande." },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    }
    const upstream = await fetch(
      `${API_URL}/api${path}${new URL(request.url).search}`,
      {
        method: request.method,
        headers,
        body: body as BodyInit | undefined,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(
          path.endsWith("/refresh") ? 300_000 : 20_000,
        ),
      },
    );
    const output = new Headers({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const key of ["content-type", "content-disposition"]) {
      const value = upstream.headers.get(key);
      if (value) output.set(key, value);
    }
    for (const cookie of upstream.headers.getSetCookie())
      output.append("set-cookie", cookie);
    return new Response(
      upstream.status === 204 ? null : await upstream.arrayBuffer(),
      { status: upstream.status, headers: output },
    );
  } catch {
    return Response.json(
      {
        detail:
          "No se pudo conectar con el servidor. Intenta de nuevo en un momento.",
      },
      { status: 503 },
    );
  }
}
