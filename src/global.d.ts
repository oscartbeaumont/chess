declare module "virtual:file-routes" {
  export const pageRoutes: readonly import("filesystem-routing/manifest").RouteManifestEntry[];
  const routes: readonly import("filesystem-routing/manifest").RouteManifestEntry[];
  export default routes;
}

declare module "virtual:solid-ssr-handler" {
  export function handleRequest(request: Request, options?: unknown): Promise<Response>;
  const handler: { fetch(request: Request): Promise<Response> };
  export default handler;
}

declare module "*.css";
