/**
 * houbun XRPC adapter — CF Worker.
 *
 * Wires the kotoba reference impl (statute/treaty/amendment legal text management)
 * into a deployable CF Worker that exposes each function as an XRPC endpoint
 * at https://houbun.etzhayyim.com/xrpc/com.etzhayyim.apps.houbun.<cmd>
 */

import { createAuthedEtzhayyim, extractBearerToken } from "@etzhayyim/sdk-auth";
import * as houbunRwFree from "@etzhayyim/houbun-kotoba";

interface Env {
  ACTOR_DID: string;
  PDS_URL: string;
  L2_RPC_URL: string;
  PDS_ACCESS_JWT?: string;
  PDS_REFRESH_JWT?: string;
}

type Handler = (e: any, input: unknown) => Promise<unknown>;

const NSID_BASE = "com.etzhayyim.apps.houbun";

interface RouteConfig {
  method: "POST" | "GET";
  handler: Handler;
}

const routes: Record<string, RouteConfig> = {
  // Statute Registry
  [`${NSID_BASE}.registerStatute`]: {
    method: "POST",
    handler: (e, input) => houbunRwFree.registerStatute(e, input as any),
  },
  [`${NSID_BASE}.getStatute`]: {
    method: "GET",
    handler: (e, input) => houbunRwFree.getStatute(e, input as any),
  },
  [`${NSID_BASE}.listStatutes`]: {
    method: "GET",
    handler: (e, input) => houbunRwFree.listStatutes(e, input as any),
  },

  // Article/Content
  [`${NSID_BASE}.registerArticle`]: {
    method: "POST",
    handler: (e, input) => houbunRwFree.registerArticle(e, input as any),
  },
  [`${NSID_BASE}.getArticle`]: {
    method: "GET",
    handler: (e, input) => houbunRwFree.getArticle(e, input as any),
  },

  // Treaty Registry
  [`${NSID_BASE}.registerTreaty`]: {
    method: "POST",
    handler: (e, input) => houbunRwFree.registerTreaty(e, input as any),
  },
  [`${NSID_BASE}.getTreaty`]: {
    method: "GET",
    handler: (e, input) => houbunRwFree.getTreaty(e, input as any),
  },

  // Amendment Lineage
  [`${NSID_BASE}.recordAmendment`]: {
    method: "POST",
    handler: (e, input) => houbunRwFree.recordAmendment(e, input as any),
  },

  // Ingest
  [`${NSID_BASE}.ingestStatuteJpn`]: {
    method: "POST",
    handler: (e, input) => houbunRwFree.ingestStatuteJpn(e, input as any),
  },
  [`${NSID_BASE}.ingestStatuteUsa`]: {
    method: "POST",
    handler: (e, input) => houbunRwFree.ingestStatuteUsa(e, input as any),
  },
  [`${NSID_BASE}.ingestEurLex`]: {
    method: "POST",
    handler: (e, input) => houbunRwFree.ingestEurLex(e, input as any),
  },
  [`${NSID_BASE}.ingestTreatyUn`]: {
    method: "POST",
    handler: (e, input) => houbunRwFree.ingestTreatyUn(e, input as any),
  },
};

function mapStatus(status?: string): number {
  if (
    status === "rejected" ||
    status?.includes("invalid") ||
    status?.includes("notFound")
  ) {
    return status?.includes("notFound") ? 404 : 400;
  }
  return 200;
}

function jsonResponse(
  body: unknown,
  status: number = 200,
  init?: ResponseInit
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
    ...init,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (!url.pathname.startsWith("/xrpc/")) {
      return jsonResponse({ error: "NotFound" }, 404);
    }

    const nsid = url.pathname.slice("/xrpc/".length);
    const route = routes[nsid];

    if (!route) {
      return jsonResponse({ error: "MethodNotFound", nsid }, 404);
    }

    if (req.method !== route.method) {
      return jsonResponse({ error: "MethodNotAllowed" }, 405);
    }

    // Instantiate Etzhayyim SDK with auth
    const bearerToken = extractBearerToken(req);
    const e = createAuthedEtzhayyim({ env, bearerToken });

    try {
      const input =
        route.method === "POST"
          ? await req.json().catch(() => ({}))
          : Object.fromEntries(url.searchParams.entries());

      const result = await route.handler(e, input);
      return jsonResponse(result, mapStatus((result as any)?.status));
    } catch (err) {
      return jsonResponse(
        {
          error: "InternalError",
          message: err instanceof Error ? err.message : String(err),
        },
        500
      );
    }
  },
} satisfies ExportedHandler<Env>;
