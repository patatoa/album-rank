import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createAuthClient, errorResponse, jsonResponse, handleOptions, requireUser } from "../_shared/supabaseClients.ts";

type RequestBody = {
  term?: string;
};

type MusicBrainzResult = {
  collectionId: string;
  collectionName: string;
  artistName: string;
  releaseDate: string | null;
  artworkUrl60: string | null;
  artworkUrl100: string | null;
  collectionViewUrl: string;
};

const USER_AGENT =
  Deno.env.get("MUSICBRAINZ_USER_AGENT") ?? "AlbumRank/1.0 (https://album-rank.local; contact@album-rank.local)";

const buildArtistName = (credits: Array<{ name?: string; artist?: { name?: string } }>) =>
  credits
    .map((credit) => credit.name ?? credit.artist?.name)
    .filter(Boolean)
    .join(", ");

serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const authClient = createAuthClient(authHeader);
    await requireUser(authClient);

    const body = (await req.json()) as RequestBody;
    const term = body.term?.trim();
    if (!term) {
      return jsonResponse([]);
    }

    const params = new URLSearchParams({
      query: `${term} AND primarytype:album`,
      limit: "10",
      fmt: "json"
    });
    const response = await fetch(`https://musicbrainz.org/ws/2/release-group?${params.toString()}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return errorResponse(`MusicBrainz error: ${text || response.status}`, response.status);
    }

    const payload = await response.json();
    const groups = (payload["release-groups"] ?? []) as any[];

    const results: MusicBrainzResult[] = await Promise.all(
      groups.map(async (item) => {
        const credits = (item["artist-credit"] ?? []) as Array<{ name?: string; artist?: { name?: string } }>;
        const artistName = buildArtistName(credits);
        const coverBase = `https://coverartarchive.org/release-group/${item.id}`;

        let artworkUrl60: string | null = null;
        let artworkUrl100: string | null = null;

        try {
          const head = await fetch(`${coverBase}/front-250`, { method: "HEAD" });
          if (head.ok) {
            artworkUrl60 = `${coverBase}/front-250`;
            artworkUrl100 = `${coverBase}/front-500`;
          }
        } catch {
          // Ignore cover lookup failures; fall back to no artwork.
        }

        return {
          collectionId: item.id,
          collectionName: item.title,
          artistName,
          releaseDate: item["first-release-date"] ?? null,
          artworkUrl60,
          artworkUrl100,
          collectionViewUrl: `https://musicbrainz.org/release-group/${item.id}`
        };
      })
    );

    return jsonResponse(results);
  } catch (err) {
    console.error("musicbrainz_search error", err);
    const status =
      err instanceof Error && (err.message === "Unauthorized" || err.message.includes("Authorization"))
        ? 401
        : 500;
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", status);
  }
});
