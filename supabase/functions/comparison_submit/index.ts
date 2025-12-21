import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  createAuthClient,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireUser,
  handleOptions
} from "../_shared/supabaseClients.ts";
import { calculateElo } from "../_shared/elo.ts";

type RequestBody = {
  rankingListId: string;
  leftAlbumId: string;
  rightAlbumId: string;
  winnerAlbumId: string;
};

const K = 32;

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
    if (!body?.rankingListId || !body.leftAlbumId || !body.rightAlbumId || !body.winnerAlbumId) {
      return errorResponse("Missing required fields", 400);
    }

    if (![body.leftAlbumId, body.rightAlbumId].includes(body.winnerAlbumId)) {
      return errorResponse("winnerAlbumId must match one of the pair", 400);
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

    const ensureRating = async (albumId: string) => {
      const { data, error } = await serviceClient
        .from("elo_ratings")
        .upsert(
          { ranking_list_id: body.rankingListId, album_id: albumId },
          { onConflict: "ranking_list_id,album_id" }
        )
        .select("rating, matches")
        .eq("ranking_list_id", body.rankingListId)
        .eq("album_id", albumId)
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Failed to load Elo rating");
      }

      return data as { rating: number; matches: number };
    };

    const left = await ensureRating(body.leftAlbumId);
    const right = await ensureRating(body.rightAlbumId);

    const winnerIsLeft = body.winnerAlbumId === body.leftAlbumId;
    const { playerRating: leftNew, opponentRating: rightNew } = calculateElo(left.rating, right.rating, winnerIsLeft, K);

    const { error: comparisonError } = await serviceClient.from("comparisons").insert({
      ranking_list_id: body.rankingListId,
      left_album_id: body.leftAlbumId,
      right_album_id: body.rightAlbumId,
      winner_album_id: body.winnerAlbumId
    });

    if (comparisonError) {
      return errorResponse(comparisonError.message, 500);
    }

    const updateRating = async (albumId: string, rating: number, matches: number) => {
      const { error } = await serviceClient
        .from("elo_ratings")
        .update({ rating, matches, updated_at: new Date().toISOString() })
        .eq("ranking_list_id", body.rankingListId)
        .eq("album_id", albumId);

      if (error) {
        throw new Error(error.message);
      }
    };

    await updateRating(body.leftAlbumId, leftNew, left.matches + 1);
    await updateRating(body.rightAlbumId, rightNew, right.matches + 1);

    return jsonResponse({
      left: { albumId: body.leftAlbumId, rating: leftNew, matches: left.matches + 1 },
      right: { albumId: body.rightAlbumId, rating: rightNew, matches: right.matches + 1 }
    });
  } catch (err) {
    console.error("comparison_submit error", err);
    const status =
      err instanceof Error && (err.message === "Unauthorized" || err.message.includes("Authorization"))
        ? 401
        : 500;
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", status);
  }
});
