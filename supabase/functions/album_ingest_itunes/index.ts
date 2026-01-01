import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  createAuthClient,
  createServiceClient,
  errorResponse,
  jsonResponse,
  requireUser,
  handleOptions
} from "../_shared/supabaseClients.ts";

type ItunesPayload = {
  collectionId: string | number;
  collectionName: string;
  artistName: string;
  releaseDate?: string | null;
  artworkUrl60: string;
  artworkUrl100: string;
  collectionViewUrl?: string | null;
};

type RequestBody = {
  itunes: ItunesPayload;
  targetListId?: string | null;
  includeInList?: boolean;
};

const bucket = "album-art";

const parseYear = (date?: string | null) => {
  if (!date) return null;
  const year = new Date(date).getUTCFullYear();
  return Number.isNaN(year) ? null : year;
};

const fetchArtworkBytes = async (primaryUrl: string) => {
  // Try to request a higher-res version by swapping the size in the URL (iTunes convention).
  const deriveLarge = (url: string) => url.replace(/\/[0-9]+x[0-9]+bb\./, "/1000x1000bb.");
  const candidates = [deriveLarge(primaryUrl), primaryUrl];

  for (const url of candidates) {
    const response = await fetch(url);
    if (response.ok) {
      return response.arrayBuffer();
    }
  }

  throw new Error("Failed to fetch artwork from provided URLs");
};

const uploadImage = async (
  path: string,
  bytes: ArrayBuffer,
  serviceClient: ReturnType<typeof createServiceClient>
) => {
  const { error } = await serviceClient.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType: "image/jpeg"
  });

  if (error) {
    throw error;
  }
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
    if (!body?.itunes?.collectionId || !body.itunes.collectionName || !body.itunes.artistName) {
      return errorResponse("Missing required iTunes payload fields", 400);
    }

    const includeInList = body.includeInList ?? true;
    const collectionId = String(body.itunes.collectionId);
    const releaseYear = parseYear(body.itunes.releaseDate);

    const baseAlbum = {
      provider: "itunes",
      provider_album_id: collectionId,
      title: body.itunes.collectionName,
      artist: body.itunes.artistName,
      release_year: releaseYear,
      itunes_url: body.itunes.collectionViewUrl ?? null
    };

    const { data: existingAlbum, error: selectError } = await serviceClient
      .from("albums")
      .select("*")
      .eq("provider", "itunes")
      .eq("provider_album_id", collectionId)
      .maybeSingle();

    if (selectError) {
      return errorResponse(selectError.message, 500);
    }

    let albumId: string;
    let createdAlbum = false;
    let needsArtwork = false;
    let createdRankingItem = false;

    if (!existingAlbum) {
      const { data, error } = await serviceClient
        .from("albums")
        .insert({ ...baseAlbum })
        .select("id")
        .single();

      if (error || !data) {
        return errorResponse(error?.message ?? "Failed to create album", 500);
      }

      albumId = data.id;
      createdAlbum = true;
      needsArtwork = true;
    } else {
      albumId = existingAlbum.id;
      needsArtwork = !existingAlbum.artwork_thumb_path || !existingAlbum.artwork_medium_path;

      const { error } = await serviceClient
        .from("albums")
        .update({ ...baseAlbum, updated_at: new Date().toISOString() })
        .eq("id", albumId);

      if (error) {
        return errorResponse(error.message, 500);
      }
    }

    if (needsArtwork) {
      const thumbPath = `itunes/${collectionId}/thumb.jpg`;
      const mediumPath = `itunes/${collectionId}/medium.jpg`;

      const artworkBytes = await fetchArtworkBytes(body.itunes.artworkUrl100);
      await uploadImage(thumbPath, artworkBytes, serviceClient);
      await uploadImage(mediumPath, artworkBytes, serviceClient);

      const { error } = await serviceClient
        .from("albums")
        .update({
          artwork_thumb_path: thumbPath,
          artwork_medium_path: mediumPath,
          updated_at: new Date().toISOString()
        })
        .eq("id", albumId);

      if (error) {
        return errorResponse(error.message, 500);
      }
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

    if (includeInList && body.targetListId) {
      const rankingListId = body.targetListId;

      const { data: ownership, error: ownershipError } = await serviceClient
        .from("ranking_lists")
        .select("id, mode")
        .eq("id", rankingListId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (ownershipError) {
        return errorResponse(ownershipError.message, 500);
      }

      if (!ownership) {
        return errorResponse("Ranking list not found for user", 403);
      }

      const mode = ownership.mode as "ranked" | "collection";

      const { data: existingItem, error: itemError } = await serviceClient
        .from("ranking_items")
        .select("position")
        .eq("ranking_list_id", rankingListId)
        .eq("album_id", albumId)
        .maybeSingle();

      if (itemError) {
        return errorResponse(itemError.message, 500);
      }

      if (!existingItem) {
        let position: number | null = null;
        if (mode === "ranked") {
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

          position = (maxRow?.position ?? 0) + 1;
        }

        const { error: insertError } = await serviceClient.from("ranking_items").insert({
          ranking_list_id: rankingListId,
          album_id: albumId,
          position
        });

        if (insertError) {
          return errorResponse(insertError.message, 500);
        }

        createdRankingItem = true;
      }

      if (mode === "ranked") {
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
    }

    const getOrCreateAllTimeList = async () => {
      const { data: existing, error: selectError } = await serviceClient
        .from("ranking_lists")
        .select("id")
        .eq("user_id", user.id)
        .eq("kind", "custom")
        .eq("name", "All Time")
        .maybeSingle();

      if (selectError) {
        throw selectError;
      }

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
      // Do not fail the whole ingest; best-effort
    }

    return jsonResponse({
      albumId,
      createdAlbum,
      createdRankingItem
    });
  } catch (err) {
    console.error("album_ingest_itunes error", err);
    const status =
      err instanceof Error && (err.message === "Unauthorized" || err.message.includes("Authorization"))
        ? 401
        : 500;
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", status);
  }
});
