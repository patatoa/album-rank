import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  createAuthClient,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireUser
} from "../_shared/supabaseClients.ts";

type RequestBody = {
  title: string;
  artist: string;
  releaseYear?: number | null;
  targetRankingListId?: string | null;
  includeInRanking?: boolean;
  coverBase64?: string;
  thumbBase64?: string;
  mediumBase64?: string;
};

const bucket = "album-art";

const decodeBase64 = (value?: string) => {
  if (!value) return null;
  try {
    const cleaned = value.replace(/^data:image\/\w+;base64,/, "");
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const authClient = createAuthClient(authHeader);
    const user = await requireUser(authClient);
    const serviceClient = createServiceClient();

    const body = (await req.json()) as RequestBody;
    if (!body?.title || !body.artist) {
      return errorResponse("Title and artist are required", 400);
    }

    const includeInRanking = body.includeInRanking ?? true;
    const coverBytes = decodeBase64(body.coverBase64 ?? body.thumbBase64 ?? body.mediumBase64);

    // Reuse the same image for both sizes (scaling handled client-side or later)
    const thumbBytes = coverBytes;
    const mediumBytes = decodeBase64(body.mediumBase64 ?? body.coverBase64 ?? body.thumbBase64);

    if (!thumbBytes) {
      return errorResponse("Invalid or missing image data", 400);
    }

    const { data: albumData, error: insertError } = await serviceClient
      .from("albums")
      .insert({
        provider: "manual",
        created_by_user_id: user.id,
        title: body.title,
        artist: body.artist,
        release_year: body.releaseYear ?? null
      })
      .select("id")
      .single();

    if (insertError || !albumData) {
      return errorResponse(insertError?.message ?? "Failed to create album", 500);
    }

    const albumId = albumData.id as string;
    const thumbPath = `manual/${albumId}/thumb.jpg`;
    const mediumPath = `manual/${albumId}/medium.jpg`;

    const uploadThumb = await serviceClient.storage
      .from(bucket)
      .upload(thumbPath, thumbBytes, { upsert: true, contentType: "image/jpeg" });
    if (uploadThumb.error) {
      return errorResponse(uploadThumb.error.message, 500);
    }

    const uploadMedium = await serviceClient.storage
      .from(bucket)
      .upload(mediumPath, mediumBytes, { upsert: true, contentType: "image/jpeg" });
    if (uploadMedium.error) {
      return errorResponse(uploadMedium.error.message, 500);
    }

    const { error: updateError } = await serviceClient
      .from("albums")
      .update({
        artwork_thumb_path: thumbPath,
        artwork_medium_path: mediumPath,
        updated_at: new Date().toISOString()
      })
      .eq("id", albumId);

    if (updateError) {
      return errorResponse(updateError.message, 500);
    }

    const { error: userAlbumError } = await serviceClient.from("user_albums").upsert(
      {
        user_id: user.id,
        album_id: albumId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,album_id" }
    );

    if (userAlbumError) {
      return errorResponse(userAlbumError.message, 500);
    }

    let createdRankingItem = false;

    if (includeInRanking && body.targetRankingListId) {
      const rankingListId = body.targetRankingListId;

      const { data: ownership, error: ownershipError } = await serviceClient
        .from("ranking_lists")
        .select("id")
        .eq("id", rankingListId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (ownershipError) {
        return errorResponse(ownershipError.message, 500);
      }

      if (!ownership) {
        return errorResponse("Ranking list not found for user", 403);
      }

      const { data: maxRow, error: maxError } = await serviceClient
        .from("ranking_items")
        .select("position")
        .eq("ranking_list_id", rankingListId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (maxError) {
        return errorResponse(maxError.message, 500);
      }

      const nextPosition = (maxRow?.position ?? 0) + 1;
      const { error: insertItemError } = await serviceClient.from("ranking_items").insert({
        ranking_list_id: rankingListId,
        album_id: albumId,
        position: nextPosition
      });

      if (insertItemError) {
        return errorResponse(insertItemError.message, 500);
      }

      createdRankingItem = true;

      const { error: eloError } = await serviceClient
        .from("elo_ratings")
        .upsert(
          { ranking_list_id: rankingListId, album_id: albumId },
          { onConflict: "ranking_list_id,album_id" }
        );

      if (eloError) {
        return errorResponse(eloError.message, 500);
      }
    }

    const getOrCreateAllTimeList = async () => {
      const { data: existing, error: selectError } = await serviceClient
        .from("ranking_lists")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "custom")
        .eq("name", "All Time")
        .maybeSingle();

      if (selectError) throw selectError;
      if (existing) return existing.id as string;

      const { data: inserted, error: insertError } = await serviceClient
        .from("ranking_lists")
        .insert({ user_id: user.id, kind: "custom", name: "All Time" })
        .select("id")
        .single();

      if (insertError || !inserted) {
        throw insertError ?? new Error("Failed to create All Time ranking");
      }

      return inserted.id as string;
    };

    const ensureRankingItem = async (rankingListId: string) => {
      const { data: existingItem, error: itemError } = await serviceClient
        .from("ranking_items")
        .select("position")
        .eq("ranking_list_id", rankingListId)
        .eq("album_id", albumId)
        .maybeSingle();

      if (itemError) throw itemError;
      if (existingItem) return false;

      const { data: maxRow, error: maxError } = await serviceClient
        .from("ranking_items")
        .select("position")
        .eq("ranking_list_id", rankingListId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (maxError) throw maxError;

      const nextPosition = (maxRow?.position ?? 0) + 1;
      const { error: insertError } = await serviceClient.from("ranking_items").insert({
        ranking_list_id: rankingListId,
        album_id: albumId,
        position: nextPosition
      });

      if (insertError) throw insertError;

      const { error: eloError } = await serviceClient
        .from("elo_ratings")
        .upsert(
          { ranking_list_id: rankingListId, album_id: albumId },
          { onConflict: "ranking_list_id,album_id" }
        );

      if (eloError) throw eloError;

      return true;
    };

    try {
      const allTimeListId = await getOrCreateAllTimeList();
      const addedAllTime = await ensureRankingItem(allTimeListId);
      if (addedAllTime) {
        createdRankingItem = true;
      }
    } catch (err) {
      console.error("Failed to ensure All Time ranking", err);
    }

    return jsonResponse({
      albumId,
      createdRankingItem
    });
  } catch (err) {
    console.error("album_create_manual error", err);
    const status =
      err instanceof Error && (err.message === "Unauthorized" || err.message.includes("Authorization"))
        ? 401
        : 500;
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", status);
  }
});
