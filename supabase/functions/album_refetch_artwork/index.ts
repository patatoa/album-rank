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
  albumId?: string;
};

const bucket = "album-art";

const extensionFromContentType = (contentType: string) => {
  if (contentType.includes("image/png")) return "png";
  if (contentType.includes("image/webp")) return "webp";
  if (contentType.includes("image/jpeg") || contentType.includes("image/jpg")) return "jpg";
  return "jpg";
};

const fetchArtworkBytes = async (primaryUrl: string) => {
  const response = await fetch(primaryUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch artwork: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  return { bytes: await response.arrayBuffer(), contentType };
};

const uploadImage = async (
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
  serviceClient: ReturnType<typeof createServiceClient>
) => {
  const { error } = await serviceClient.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType
  });
  if (error) throw error;
};

const getArtworkUrl = async (album: { provider_album_id: string | null; itunes_url: string | null }) => {
  const providerId = album.provider_album_id;
  if (!providerId) return null;

  if (album.itunes_url?.includes("musicbrainz.org")) {
    return `https://coverartarchive.org/release-group/${providerId}/front-500`;
  }

  const params = new URLSearchParams({ id: providerId, entity: "album" });
  const response = await fetch(`https://itunes.apple.com/lookup?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to lookup iTunes artwork");
  }
  const json = await response.json();
  const first = (json.results ?? [])[0] as { artworkUrl100?: string };
  return first?.artworkUrl100 ?? null;
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
    if (!body.albumId) {
      return errorResponse("Missing albumId", 400);
    }

    const { data: membership, error: membershipError } = await serviceClient
      .from("user_albums")
      .select("album_id")
      .eq("album_id", body.albumId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) return errorResponse(membershipError.message, 500);
    if (!membership) return errorResponse("Album not found for user", 403);

    const { data: album, error: albumError } = await serviceClient
      .from("albums")
      .select("id, provider, provider_album_id, itunes_url")
      .eq("id", body.albumId)
      .single();
    if (albumError || !album) return errorResponse(albumError?.message ?? "Album not found", 404);

    if (album.provider !== "itunes") {
      return errorResponse("Artwork refetch only supported for external albums", 400);
    }

    const artworkUrl = await getArtworkUrl(album);
    if (!artworkUrl) {
      return errorResponse("No artwork URL available", 400);
    }

    const artwork = await fetchArtworkBytes(artworkUrl);
    const ext = extensionFromContentType(artwork.contentType);
    const thumbPath = `itunes/${album.provider_album_id}/thumb.${ext}`;
    const mediumPath = `itunes/${album.provider_album_id}/medium.${ext}`;

    await uploadImage(thumbPath, artwork.bytes, artwork.contentType, serviceClient);
    await uploadImage(mediumPath, artwork.bytes, artwork.contentType, serviceClient);

    const { error: updateError } = await serviceClient
      .from("albums")
      .update({
        artwork_thumb_path: thumbPath,
        artwork_medium_path: mediumPath,
        updated_at: new Date().toISOString()
      })
      .eq("id", album.id);
    if (updateError) return errorResponse(updateError.message, 500);

    return jsonResponse({ ok: true, artwork_thumb_path: thumbPath, artwork_medium_path: mediumPath });
  } catch (err) {
    console.error("album_refetch_artwork error", err);
    const status =
      err instanceof Error && (err.message === "Unauthorized" || err.message.includes("Authorization"))
        ? 401
        : 500;
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", status);
  }
});
