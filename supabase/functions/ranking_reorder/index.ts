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
  orderedAlbumIds: string[];
};

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
    if (!body?.rankingListId || !Array.isArray(body.orderedAlbumIds)) {
      return errorResponse("rankingListId and orderedAlbumIds are required", 400);
    }

    const { data: ranking, error: rankingError } = await serviceClient
      .from("ranking_lists")
      .select("id, user_id")
      .eq("id", body.rankingListId)
      .maybeSingle();

    if (rankingError) {
      return errorResponse(rankingError.message, 500);
    }

    if (!ranking || ranking.user_id !== user.id) {
      return errorResponse("Ranking list not found for user", 403);
    }

    const { data: items, error: itemsError } = await serviceClient
      .from("ranking_items")
      .select("album_id")
      .eq("ranking_list_id", body.rankingListId);

    if (itemsError) {
      return errorResponse(itemsError.message, 500);
    }

    const existingIds = new Set((items ?? []).map((i) => i.album_id as string));
    if (
      existingIds.size !== body.orderedAlbumIds.length ||
      body.orderedAlbumIds.some((id) => !existingIds.has(id))
    ) {
      return errorResponse("orderedAlbumIds must exactly match current ranking items", 400);
    }

    for (let i = 0; i < body.orderedAlbumIds.length; i++) {
      const albumId = body.orderedAlbumIds[i];
      const { error: updateError } = await serviceClient
        .from("ranking_items")
        .update({ position: i + 1 })
        .eq("ranking_list_id", body.rankingListId)
        .eq("album_id", albumId);

      if (updateError) {
        return errorResponse(updateError.message, 500);
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("ranking_reorder error", err);
    const status =
      err instanceof Error && (err.message === "Unauthorized" || err.message.includes("Authorization"))
        ? 401
        : 500;
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", status);
  }
});
