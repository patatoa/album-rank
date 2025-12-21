import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  createAuthClient,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireUser,
  handleOptions
} from "../_shared/supabaseClients.ts";

type RequestBody = {
  rankingListId: string;
  action: "share" | "unshare";
};

const generateSlug = () => crypto.randomUUID();

serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const authClient = createAuthClient(authHeader);
    const user = await requireUser(authClient);
    const serviceClient = createServiceClient();

    const body = (await req.json()) as RequestBody;
    if (!body?.rankingListId || !body.action) {
      return errorResponse("Missing fields", 400);
    }

    const { data: ranking, error: rankingError } = await serviceClient
      .from("ranking_lists")
      .select("id, user_id, public_slug, is_public")
      .eq("id", body.rankingListId)
      .maybeSingle();

    if (rankingError) {
      return errorResponse(rankingError.message, 500);
    }

    if (!ranking || ranking.user_id !== user.id) {
      return errorResponse("Not found", 404);
    }

    if (body.action === "unshare") {
      const { error } = await serviceClient
        .from("ranking_lists")
        .update({ is_public: false, public_slug: null, updated_at: new Date().toISOString() })
        .eq("id", body.rankingListId);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ publicSlug: null, isPublic: false });
    }

    // share
    const slug = ranking.public_slug ?? generateSlug();
    const { error } = await serviceClient
      .from("ranking_lists")
      .update({ is_public: true, public_slug: slug, updated_at: new Date().toISOString() })
      .eq("id", body.rankingListId);

    if (error) return errorResponse(error.message, 500);

    return jsonResponse({ publicSlug: slug, isPublic: true });
  } catch (err) {
    console.error("ranking_share error", err);
    const status =
      err instanceof Error && (err.message === "Unauthorized" || err.message.includes("Authorization"))
        ? 401
        : 500;
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", status);
  }
});
