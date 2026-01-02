import { supabase } from "./supabaseClient";
import { Album, RankingItem, RankingList, UserAlbum, UserPreferences } from "../types";
import { NEEDS_LIST_NAME } from "./constants";

const edgeInvoke = async <T>(name: string, body: Record<string, unknown>) => {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const { data, error } = await supabase.functions.invoke<T>(name, {
    body,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined
  });
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
};

const getUserId = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw error ?? new Error("No auth user");
  }
  return data.user.id;
};

export const searchMusicBrainz = async (term: string) => {
  const trimmed = term.trim();
  if (!trimmed) return [];
  return edgeInvoke<any[]>("musicbrainz_search", { term: trimmed });
};

export const ingestItunesAlbum = (payload: {
  itunes: {
    collectionId: string | number;
    collectionName: string;
    artistName: string;
    releaseDate?: string | null;
    artworkUrl60?: string | null;
    artworkUrl100?: string | null;
    collectionViewUrl?: string | null;
  };
  targetListId?: string | null;
  includeInList?: boolean;
}) => edgeInvoke<{ albumId: string; createdAlbum: boolean; createdRankingItem: boolean }>("album_ingest_itunes", payload);

export const createManualAlbum = (payload: {
  title: string;
  artist: string;
  releaseYear?: number | null;
  targetListId?: string | null;
  includeInList?: boolean;
  coverBase64?: string;
}) => edgeInvoke<{ albumId: string; createdRankingItem: boolean }>("album_create_manual", payload);

export const getRankingLists = async (): Promise<RankingList[]> => {
  const { data, error } = await supabase.from("ranking_lists").select("*").order("created_at");
  if (error) throw error;
  return data as unknown as RankingList[];
};

export const getRankingList = async (id: string): Promise<RankingList | null> => {
  const { data, error } = await supabase.from("ranking_lists").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as RankingList) ?? null;
};

export const getRankingItems = async (rankingListId: string): Promise<RankingItem[]> => {
  const { data: items, error } = await supabase
    .from("ranking_items")
    .select("ranking_list_id, album_id, position, added_at, album:album_id(*)")
    .eq("ranking_list_id", rankingListId)
    .order("position", { nullsFirst: true });
  if (error) throw error;
  return (items ?? []) as unknown as RankingItem[];
};

export const reorderRanking = async (payload: { rankingListId: string; orderedAlbumIds: string[] }) => {
  // Two-phase update to avoid position unique conflicts: bump positions, then set final order
  const tempOffset = 1000;
  for (let i = 0; i < payload.orderedAlbumIds.length; i++) {
    const albumId = payload.orderedAlbumIds[i];
    const { error } = await supabase
      .from("ranking_items")
      .update({ position: tempOffset + i + 1 })
      .eq("ranking_list_id", payload.rankingListId)
      .eq("album_id", albumId);
    if (error) throw error;
  }
  for (let i = 0; i < payload.orderedAlbumIds.length; i++) {
    const albumId = payload.orderedAlbumIds[i];
    const { error } = await supabase
      .from("ranking_items")
      .update({ position: i + 1 })
      .eq("ranking_list_id", payload.rankingListId)
      .eq("album_id", albumId);
    if (error) throw error;
  }
};

export const shareRanking = async (rankingListId: string) => {
  const { data, error } = await supabase.functions.invoke<{ publicSlug: string; isPublic: boolean }>(
    "ranking_share",
    { body: { rankingListId, action: "share" } }
  );
  if (error) throw error;
  return data;
};

export const unshareRanking = async (rankingListId: string) => {
  const { data, error } = await supabase.functions.invoke<{ publicSlug: string | null; isPublic: boolean }>(
    "ranking_share",
    { body: { rankingListId, action: "unshare" } }
  );
  if (error) throw error;
  return data;
};

export const getAlbumDetail = async (albumId: string): Promise<{ album: Album; userAlbum: UserAlbum | null }> => {
  const { data: album, error: albumError } = await supabase.from("albums").select("*").eq("id", albumId).single();
  if (albumError) throw albumError;

  const { data: ua, error: uaError } = await supabase
    .from("user_albums")
    .select("*")
    .eq("album_id", albumId)
    .maybeSingle();

  if (uaError) throw uaError;
  return { album: album as Album, userAlbum: ua as UserAlbum | null };
};

export const upsertUserAlbum = async (payload: Partial<UserAlbum> & { album_id: string }) => {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("user_albums")
    .upsert({ ...payload, user_id: userId }, { onConflict: "user_id,album_id" });
  if (error) throw error;
  return data;
};

export const submitComparison = (payload: {
  rankingListId: string;
  leftAlbumId: string;
  rightAlbumId: string;
  winnerAlbumId: string;
}) =>
  edgeInvoke<{
    left: { albumId: string; rating: number; matches: number };
    right: { albumId: string; rating: number; matches: number };
  }>("comparison_submit", payload);

export const getAlbumMemberships = async (albumId: string) => {
  const { data, error } = await supabase
    .from("ranking_items")
    .select("ranking_list_id, album_id, position")
    .eq("album_id", albumId)
    .order("position");
  if (error) throw error;
  return (data ?? []) as RankingItem[];
};

export const addAlbumToRanking = async (rankingListId: string, albumId: string) => {
  // fetch list mode to decide position
  const { data: list, error: listError } = await supabase
    .from("ranking_lists")
    .select("mode")
    .eq("id", rankingListId)
    .maybeSingle();
  if (listError) throw listError;
  const mode = (list?.mode as "ranked" | "collection") ?? "ranked";

  let position: number | null = null;
  if (mode === "ranked") {
    const { data: maxRow, error: maxError } = await supabase
      .from("ranking_items")
      .select("position")
      .eq("ranking_list_id", rankingListId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw maxError;
    position = (maxRow?.position ?? 0) + 1;
  }

  const { error } = await supabase
    .from("ranking_items")
    .insert({ ranking_list_id: rankingListId, album_id: albumId, position });
  if (error) throw error;
};

export const removeAlbumFromRanking = async (rankingListId: string, albumId: string) => {
  // Determine mode to decide reindexing
  const { data: list, error: listError } = await supabase
    .from("ranking_lists")
    .select("mode")
    .eq("id", rankingListId)
    .maybeSingle();
  if (listError) throw listError;
  const mode = (list?.mode as "ranked" | "collection") ?? "ranked";

  const { error } = await supabase
    .from("ranking_items")
    .delete()
    .eq("ranking_list_id", rankingListId)
    .eq("album_id", albumId);
  if (error) throw error;

  if (mode === "ranked") {
    const { data: remaining, error: listError2 } = await supabase
      .from("ranking_items")
      .select("album_id")
      .eq("ranking_list_id", rankingListId)
      .order("position");
    if (listError2) throw listError2;
    const orderedAlbumIds = (remaining ?? []).map((r) => r.album_id);
    if (orderedAlbumIds.length > 0) {
      await reorderRanking({ rankingListId, orderedAlbumIds });
    }
  }
};

export const ensureRankingLists = async (years: number[], custom: string[] = []) => {
  const customWithNeeds = Array.from(new Set([...(custom ?? []), NEEDS_LIST_NAME]));

  const fallbackClientInsert = async () => {
    const userId = await getUserId();
    // Ensure special collection list exists
    const { data: needsExisting, error: needsSelectError } = await supabase
      .from("ranking_lists")
      .select("id")
      .eq("user_id", userId)
      .eq("name", NEEDS_LIST_NAME)
      .maybeSingle();
    if (needsSelectError) throw needsSelectError;
    if (!needsExisting) {
      const { error: needsInsertError } = await supabase.from("ranking_lists").insert({
        user_id: userId,
        kind: "custom",
        name: NEEDS_LIST_NAME,
        mode: "collection",
        description: "Auto-collection of albums to listen"
      });
      if (needsInsertError) throw needsInsertError;
    }

    for (const year of years) {
      const { data: existing, error: selectError } = await supabase
        .from("ranking_lists")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", "year")
        .eq("year", year)
        .maybeSingle();
      if (selectError) throw selectError;
      if (!existing) {
        const { error: insertError } = await supabase
          .from("ranking_lists")
          .insert({ user_id: userId, kind: "year", year, name: String(year), mode: "ranked" });
        if (insertError) throw insertError;
      }
    }
    for (const name of customWithNeeds) {
      const { data: existing, error: selectError } = await supabase
        .from("ranking_lists")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", "custom")
        .eq("name", name)
        .maybeSingle();
      if (selectError) throw selectError;
      if (!existing) {
        const mode = name === NEEDS_LIST_NAME ? "collection" : "ranked";
        const { error: insertError } = await supabase
          .from("ranking_lists")
          .insert({ user_id: userId, kind: "custom", name, mode });
        if (insertError) throw insertError;
      }
    }
  };

  try {
    await edgeInvoke<{ ok: boolean }>("ensure_ranking_lists", { years, custom: customWithNeeds });
  } catch (err) {
    console.warn("ensureRankingLists via Edge Function failed, falling back to client insert", err);
    await fallbackClientInsert();
  }

  return getRankingLists();
};

export const getNeedsListeningItems = async (rankingListId: string): Promise<RankingItem[]> => {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("user_albums")
    .select("status, notes, created_at, album:album_id(*)")
    .eq("user_id", userId)
    .in("status", ["not_listened", "listening"]);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ranking_list_id: rankingListId,
    album_id: row.album?.id,
    position: null,
    added_at: row.created_at,
    album: row.album,
    user_status: row.status,
    user_notes: row.notes
  }));
};

export const createList = async (payload: {
  name: string;
  mode: "ranked" | "collection";
  description?: string | null;
  kind?: "year" | "custom";
  year?: number | null;
}): Promise<RankingList> => {
  const user_id = await getUserId();
  const { data, error } = await supabase
    .from("ranking_lists")
    .insert({
      user_id,
      name: payload.name,
      mode: payload.mode,
      description: payload.description ?? null,
      kind: payload.kind ?? "custom",
      year: payload.year ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as RankingList;
};

export const updateList = async (id: string, updates: Partial<Pick<RankingList, "name" | "description">>) => {
  const { error } = await supabase.from("ranking_lists").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
};

export const deleteList = async (id: string) => {
  const { error } = await supabase.from("ranking_lists").delete().eq("id", id);
  if (error) throw error;
};

export const getUserPreferences = async (): Promise<UserPreferences> => {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("user_preferences")
    .select("user_id, intro_dismissed, updated_at, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw error;
  }
  return (data as UserPreferences) ?? { user_id: userId, intro_dismissed: false, display_name: null };
};

export const dismissIntroBubble = async (): Promise<void> => {
  const userId = await getUserId();
  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: userId, intro_dismissed: true, updated_at: new Date().toISOString() });
  if (error) throw error;
};

export const setDisplayName = async (display_name: string) => {
  const userId = await getUserId();
  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: userId, display_name, updated_at: new Date().toISOString() });
  if (error) throw error;
};
