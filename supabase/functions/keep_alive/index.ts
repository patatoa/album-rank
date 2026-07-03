import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createServiceClient, errorResponse, jsonResponse, handleOptions } from "../_shared/supabaseClients.ts";

serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const secret = Deno.env.get("KEEPALIVE_SECRET");
  if (!secret) return errorResponse("KEEPALIVE_SECRET not configured", 500);

  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${secret}`) return errorResponse("Unauthorized", 401);

  const rankingListId = Deno.env.get("KEEPALIVE_RANKING_LIST_ID");
  if (!rankingListId) return errorResponse("KEEPALIVE_RANKING_LIST_ID not configured", 500);

  try {
    const client = createServiceClient();

    // Fetch current order
    const { data: items, error: fetchError } = await client
      .from("ranking_items")
      .select("album_id")
      .eq("ranking_list_id", rankingListId)
      .order("position", { ascending: true });

    if (fetchError) return errorResponse(fetchError.message, 500);
    if (!items || items.length < 6) {
      return errorResponse("Ranking list needs at least 6 albums", 400);
    }

    const album5 = items[4].album_id as string;
    const album6 = items[5].album_id as string;

    const setPosition = async (albumId: string, position: number | null) => {
      const { error } = await client
        .from("ranking_items")
        .update({ position })
        .eq("ranking_list_id", rankingListId)
        .eq("album_id", albumId);
      if (error) throw new Error(error.message);
    };

    // Swap 5 and 6: null-intermediate to avoid unique constraint conflict
    await setPosition(album5, null);
    await setPosition(album6, 5);
    await setPosition(album5, 6);

    await new Promise((r) => setTimeout(r, 5000));

    // Swap back
    await setPosition(album6, null);
    await setPosition(album5, 5);
    await setPosition(album6, 6);

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("keep_alive error", err);
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", 500);
  }
});
