export type Provider = "itunes" | "manual";

export type Album = {
  id: string;
  provider: Provider;
  provider_album_id: string | null;
  created_by_user_id: string | null;
  title: string;
  artist: string;
  release_year: number | null;
  itunes_url: string | null;
  artwork_thumb_path: string | null;
  artwork_medium_path: string | null;
};

export type UserAlbum = {
  user_id: string;
  album_id: string;
  status: "not_listened" | "listening" | "listened";
  notes: string;
};

export type UserPreferences = {
  user_id: string;
  intro_dismissed: boolean;
  updated_at?: string;
};

export type RankingList = {
  id: string;
  user_id: string;
  name: string;
  kind: "year" | "custom";
  year: number | null;
  mode: "ranked" | "collection";
  description?: string | null;
  is_public?: boolean;
  public_slug?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RankingItem = {
  ranking_list_id: string;
  album_id: string;
  position: number | null;
  added_at?: string;
  album?: Album;
  user_status?: "not_listened" | "listening" | "listened";
};

export type EloRating = {
  ranking_list_id: string;
  album_id: string;
  rating: number;
  matches: number;
};
