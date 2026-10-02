import { proxy } from "../../../lib/proxy";
export async function POST(request: Request) {
  return proxy(request, "/analyze");
}
