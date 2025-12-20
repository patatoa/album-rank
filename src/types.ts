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

export type RankingList = {
  id: string;
  user_id: string;
  name: string;
  kind: "year" | "custom";
  year: number | null;
};

export type RankingItem = {
  ranking_list_id: string;
  album_id: string;
  position: number;
  added_at?: string;
  album?: Album;
};

export type EloRating = {
  ranking_list_id: string;
  album_id: string;
  rating: number;
  matches: number;
};
