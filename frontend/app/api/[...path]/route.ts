import { proxy } from "../../../lib/proxy";
export const dynamic = "force-dynamic";
async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path.some((p) => !/^[a-zA-Z0-9-]+$/.test(p)))
    return Response.json({ detail: "Ruta inválida." }, { status: 400 });
  return proxy(request, "/" + path.join("/"));
}
export { route as GET, route as POST, route as PUT, route as DELETE };
