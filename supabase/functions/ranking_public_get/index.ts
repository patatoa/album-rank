import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createServiceClient, corsHeaders, errorResponse, jsonResponse, handleOptions } from "../_shared/supabaseClients.ts";

type RequestBody = {
  slug: string;
};

serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const serviceClient = createServiceClient();
    const body = (await req.json()) as RequestBody;

    if (!body?.slug) {
      return errorResponse("Missing slug", 400);
    }

    const { data: ranking, error: rankingError } = await serviceClient
      .from("ranking_lists")
      .select("id, name, kind, year, is_public")
      .eq("public_slug", body.slug)
      .eq("is_public", true)
      .maybeSingle();

    if (rankingError) {
      return errorResponse(rankingError.message, 500);
    }

    if (!ranking) {
      return errorResponse("Not found", 404);
    }

    const { data: items, error: itemsError } = await serviceClient
      .from("ranking_items")
      .select("album_id, position, album:album_id(id, title, artist, release_year, artwork_thumb_path)")
      .eq("ranking_list_id", ranking.id)
      .order("position");

    if (itemsError) {
      return errorResponse(itemsError.message, 500);
    }

    return jsonResponse({ ranking, items });
  } catch (err) {
    console.error("ranking_public_get error", err);
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", 500);
  }
});
