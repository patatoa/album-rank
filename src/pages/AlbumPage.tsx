import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";
import {
  addAlbumToRanking,
  ensureRankingLists,
  getAlbumDetail,
  getAlbumMemberships,
  getRankingItems,
  getRankingList,
  getRankingLists,
  removeAlbumFromRanking,
  submitComparison,
  upsertUserAlbum
} from "../lib/api";
import { supabase } from "../lib/supabaseClient";
import { RankingItem } from "../types";

const bucket = "album-art";

const albumImage = (path: string | null | undefined) => {
  if (!path) return "";
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

const useQueryParam = (key: string) => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search).get(key), [search, key]);
};

const AlbumPage = () => {
  const { albumId } = useParams<{ albumId: string }>();
  const queryClient = useQueryClient();
  const rankingQueryParam = useQueryParam("ranking");
  const [selectedRanking, setSelectedRanking] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"not_listened" | "listening" | "listened">("not_listened");

  const { data: detail } = useQuery({
    queryKey: ["album", albumId],
    queryFn: () => getAlbumDetail(albumId ?? ""),
    enabled: !!albumId
  });

  useEffect(() => {
    if (detail?.userAlbum?.notes !== undefined) setNotes(detail.userAlbum.notes);
    if (detail?.userAlbum?.status) setStatus(detail.userAlbum.status);
  }, [detail]);

  const { data: rankingLists } = useQuery({
    queryKey: ["rankingLists"],
    queryFn: getRankingLists
  });

  useEffect(() => {
    ensureRankingLists([], ["All Time"])
      .then((lists) => queryClient.setQueryData(["rankingLists"], lists))
      .catch((err) => console.error("ensureRankingLists failed", err));
  }, [queryClient]);

  const { data: memberships } = useQuery({
    queryKey: ["albumMemberships", albumId],
    queryFn: () => getAlbumMemberships(albumId ?? ""),
    enabled: !!albumId
  });

  useEffect(() => {
    if (selectedRanking) return;
    if (rankingQueryParam) {
      setSelectedRanking(rankingQueryParam);
      return;
    }
    if (memberships && memberships.length > 0) {
      setSelectedRanking(memberships[0].ranking_list_id);
      return;
    }
    if (rankingLists && rankingLists.length > 0) {
      setSelectedRanking(rankingLists[0].id);
    }
  }, [memberships, rankingLists, selectedRanking, rankingQueryParam]);

  const { data: ranking } = useQuery({
    queryKey: ["ranking", selectedRanking],
    queryFn: () => getRankingList(selectedRanking ?? ""),
    enabled: !!selectedRanking
  });

  const { data: rankingItems = [] } = useQuery({
    queryKey: ["rankingItems", selectedRanking],
    queryFn: () => getRankingItems(selectedRanking ?? ""),
    enabled: !!selectedRanking
  });

  const updateUserAlbumMutation = useMutation({
    mutationFn: upsertUserAlbum,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["album", albumId] })
  });

  const toggleMembership = async () => {
    if (!selectedRanking || !albumId) return;
    const isMember = memberships?.some((m) => m.ranking_list_id === selectedRanking);
    if (isMember) {
      await removeAlbumFromRanking(selectedRanking, albumId);
    } else {
      await addAlbumToRanking(selectedRanking, albumId);
    }
    queryClient.invalidateQueries({ queryKey: ["albumMemberships", albumId] });
    queryClient.invalidateQueries({ queryKey: ["rankingItems", selectedRanking] });
  };

  const opponent = useMemo(() => {
    return rankingItems.find((item) => item.album_id !== albumId);
  }, [rankingItems, albumId]);

  const comparisonMutation = useMutation({
    mutationFn: submitComparison
  });

  const handleCompare = (winnerAlbumId: string) => {
    if (!selectedRanking || !albumId || !opponent) return;
    comparisonMutation.mutate({
      rankingListId: selectedRanking,
      leftAlbumId: albumId,
      rightAlbumId: opponent.album_id,
      winnerAlbumId
    });
  };

  if (!detail) {
    return <div className="card">Loading album…</div>;
  }

  const album = detail.album;
  const isMember = memberships?.some((m) => m.ranking_list_id === selectedRanking);

  return (
    <div className="page-grid">
      <section className="card">
        <header className="card-header">
          <p className="eyebrow">Album</p>
          <h2>{album.title}</h2>
          <p className="muted">{album.artist}</p>
        </header>
        <div className="album-detail">
          {album.artwork_medium_path && <img src={albumImage(album.artwork_medium_path)} alt={album.title} />}
          <div className="detail-meta">
            <div className="pill">Release: {album.release_year ?? "Unknown"}</div>
            {album.provider === "itunes" && album.itunes_url && (
              <a className="pill link" href={album.itunes_url} target="_blank" rel="noreferrer">
                View on Apple
              </a>
            )}
            <label className="field">
              <span>Status</span>
              <select
                className="input"
                value={status}
                onChange={(e) => {
                  const value = e.target.value as typeof status;
                  setStatus(value);
                  updateUserAlbumMutation.mutate({ album_id: album.id, status: value, notes });
                }}
              >
                <option value="not_listened">Not listened</option>
                <option value="listening">Listening</option>
                <option value="listened">Listened</option>
              </select>
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea
                className="input"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => updateUserAlbumMutation.mutate({ album_id: album.id, status, notes })}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <p className="eyebrow">Ranking membership</p>
          <h2>{ranking?.name ?? "Select ranking"}</h2>
          <div className="form-row">
            <select className="input" value={selectedRanking ?? ""} onChange={(e) => setSelectedRanking(e.target.value)}>
              {rankingLists?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.kind === "year" && r.year ? `${r.year}` : r.name}
                </option>
              ))}
            </select>
            <button className="button" onClick={toggleMembership}>
              {isMember ? "Remove from ranking" : "Add to ranking"}
            </button>
          </div>
        </header>
        <div className="muted">
          {isMember
            ? "This album is counted in this ranking."
            : "Not in this ranking. Add it to include in comparisons."}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <p className="eyebrow">This-or-that</p>
          <h2>Compare within this ranking</h2>
        </header>
        {!opponent && <div className="muted">Need at least one other album in this ranking to compare.</div>}
        {opponent && (
          <div className="comparison">
            <div className="compare-col">
              <div className="pill">Current</div>
              <div className="album-title">{album.title}</div>
              <div className="album-artist">{album.artist}</div>
              <button
                className="button primary"
                onClick={() => handleCompare(album.id)}
                disabled={(comparisonMutation as any).isPending}
              >
                Left is better
              </button>
            </div>
            <div className="compare-col">
              <div className="pill">Opponent</div>
              <div className="album-title">{opponent.album?.title ?? "Unknown"}</div>
              <div className="album-artist">{opponent.album?.artist ?? ""}</div>
              <button
                className="button ghost"
                onClick={() => handleCompare(opponent.album_id)}
                disabled={(comparisonMutation as any).isPending}
              >
                Right is better
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default AlbumPage;
