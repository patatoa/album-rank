import { supabase } from "./supabaseClient";
import { Album, RankingItem, RankingList, UserAlbum } from "../types";

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

export const searchItunes = async (term: string) => {
  const params = new URLSearchParams({
    term,
    country: "US",
    media: "music",
    entity: "album",
    limit: "10"
  });
  const res = await fetch(`https://itunes.apple.com/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to search iTunes");
  }
  const json = await res.json();
  return (json.results ?? []) as any[];
};

export const ingestItunesAlbum = (payload: {
  itunes: {
    collectionId: string | number;
    collectionName: string;
    artistName: string;
    releaseDate?: string | null;
    artworkUrl60: string;
    artworkUrl100: string;
    collectionViewUrl?: string | null;
  };
  targetRankingListId?: string | null;
  includeInRanking?: boolean;
}) => edgeInvoke<{ albumId: string; createdAlbum: boolean; createdRankingItem: boolean }>("album_ingest_itunes", payload);

export const createManualAlbum = (payload: {
  title: string;
  artist: string;
  releaseYear?: number | null;
  targetRankingListId?: string | null;
  includeInRanking?: boolean;
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
  const { data, error } = await supabase
    .from("ranking_items")
    .select("ranking_list_id, album_id, position, added_at, album:album_id(*)")
    .eq("ranking_list_id", rankingListId)
    .order("position");
  if (error) throw error;
  return (data ?? []) as unknown as RankingItem[];
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
  const { data: maxRow, error: maxError } = await supabase
    .from("ranking_items")
    .select("position")
    .eq("ranking_list_id", rankingListId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw maxError;
  const nextPosition = (maxRow?.position ?? 0) + 1;
  const { error } = await supabase
    .from("ranking_items")
    .insert({ ranking_list_id: rankingListId, album_id: albumId, position: nextPosition });
  if (error) throw error;
};

export const removeAlbumFromRanking = async (rankingListId: string, albumId: string) => {
  const { error } = await supabase
    .from("ranking_items")
    .delete()
    .eq("ranking_list_id", rankingListId)
    .eq("album_id", albumId);
  if (error) throw error;

  const { data: remaining, error: listError } = await supabase
    .from("ranking_items")
    .select("album_id")
    .eq("ranking_list_id", rankingListId)
    .order("position");
  if (listError) throw listError;
  const orderedAlbumIds = (remaining ?? []).map((r) => r.album_id);
  if (orderedAlbumIds.length > 0) {
    await reorderRanking({ rankingListId, orderedAlbumIds });
  }
};

export const ensureRankingLists = async (years: number[], custom: string[] = []) => {
  const fallbackClientInsert = async () => {
    const userId = await getUserId();
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
          .insert({ user_id: userId, kind: "year", year, name: String(year) });
        if (insertError) throw insertError;
      }
    }
    for (const name of custom) {
      const { data: existing, error: selectError } = await supabase
        .from("ranking_lists")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", "custom")
        .eq("name", name)
        .maybeSingle();
      if (selectError) throw selectError;
      if (!existing) {
        const { error: insertError } = await supabase
          .from("ranking_lists")
          .insert({ user_id: userId, kind: "custom", name });
        if (insertError) throw insertError;
      }
    }
  };

  try {
    await edgeInvoke<{ ok: boolean }>("ensure_ranking_lists", { years, custom });
  } catch (err) {
    console.warn("ensureRankingLists via Edge Function failed, falling back to client insert", err);
    await fallbackClientInsert();
  }

  return getRankingLists();
};
