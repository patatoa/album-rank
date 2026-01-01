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
  upsertUserAlbum,
  reorderRanking
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
  const selectableLists = rankingLists?.filter((r) => r.name !== "Needs listening");
  const selectedList = selectableLists?.find((r) => r.id === selectedRanking);
  const isRankedList = (selectedList?.mode ?? "ranked") === "ranked";

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
  const membershipSet = useMemo(() => {
    const set = new Set((memberships ?? []).map((m) => m.ranking_list_id));
    const needsList = rankingLists?.find((r) => r.name === "Needs listening");
    const statusQualifies =
      detail?.userAlbum?.status === "not_listened" || detail?.userAlbum?.status === "listening";
    if (needsList && statusQualifies) {
      set.add(needsList.id);
    }
    return set;
  }, [memberships, rankingLists, detail]);

  useEffect(() => {
    if (selectedRanking) return;
    const firstSelectable = selectableLists?.[0]?.id ?? null;
    if (rankingQueryParam && selectableLists?.some((r) => r.id === rankingQueryParam)) {
      setSelectedRanking(rankingQueryParam);
      return;
    }
    if (memberships && memberships.length > 0) {
      const firstMember = memberships.find((m) =>
        selectableLists?.some((r) => r.id === m.ranking_list_id)
      );
      if (firstMember) {
        setSelectedRanking(firstMember.ranking_list_id);
        return;
      }
    }
    if (firstSelectable) {
      setSelectedRanking(firstSelectable);
    }
  }, [memberships, selectableLists, selectedRanking, rankingQueryParam]);

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["album", albumId] }),
    onError: (err) => {
      console.error("Failed to update album status/notes", err);
      alert("Failed to save status or notes.");
    }
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

  const [opponent, setOpponent] = useState<RankingItem | null>(null);

  const orderedItems = useMemo(() => {
    return [...rankingItems].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [rankingItems]);

  useEffect(() => {
    if (!albumId || !isRankedList) {
      setOpponent(null);
      return;
    }
    const candidates = orderedItems.filter((item) => item.album_id !== albumId);
    if (candidates.length === 0) {
      setOpponent(null);
      return;
    }
    // Weight toward nearby positions
    const current = orderedItems.find((i) => i.album_id === albumId);
    candidates.sort((a, b) =>
      Math.abs((a.position ?? 0) - (current?.position ?? 0)) -
      Math.abs((b.position ?? 0) - (current?.position ?? 0))
    );
    const top = candidates.slice(0, Math.min(3, candidates.length));
    const idx = Math.floor(Math.random() * top.length);
    setOpponent(top[idx]);
  }, [orderedItems, albumId]);

  const comparisonMutation = useMutation({
    mutationFn: submitComparison,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rankingItems", selectedRanking] });
      queryClient.invalidateQueries({ queryKey: ["albumMemberships", albumId] });
    },
    onError: (err) => {
      console.error("Comparison failed", err);
      alert("Failed to submit comparison.");
    }
  });

  const handleCompare = async (winnerAlbumId: string) => {
    if (!selectedRanking || !albumId || !opponent || !isRankedList) return;
    const loserAlbumId = opponent.album_id === winnerAlbumId ? albumId : opponent.album_id;

    await comparisonMutation.mutateAsync({
      rankingListId: selectedRanking,
      leftAlbumId: albumId,
      rightAlbumId: opponent.album_id,
      winnerAlbumId
    });

    // Reorder so winner stays ahead of loser; if already ahead, keep order
    const updatedIds = orderedItems.map((i) => i.album_id);
    const winnerIdx = updatedIds.indexOf(winnerAlbumId);
    const loserIdx = updatedIds.indexOf(loserAlbumId);

    if (winnerIdx === -1 || loserIdx === -1) {
      // Fallback: move winner to front if something is off
      const existingIdx = updatedIds.indexOf(winnerAlbumId);
      if (existingIdx !== -1) updatedIds.splice(existingIdx, 1);
      updatedIds.unshift(winnerAlbumId);
    } else if (winnerIdx > loserIdx) {
      // Only move if winner was below loser
      updatedIds.splice(winnerIdx, 1);
      updatedIds.splice(loserIdx, 0, winnerAlbumId);
    }

    await reorderRanking({ rankingListId: selectedRanking, orderedAlbumIds: updatedIds });
    queryClient.invalidateQueries({ queryKey: ["rankingItems", selectedRanking] });

    const candidates = orderedItems.filter((item) => item.album_id !== albumId);
    if (candidates.length === 0) {
      setOpponent(null);
    } else {
      const current = orderedItems.find((i) => i.album_id === albumId);
      candidates.sort((a, b) =>
        Math.abs((a.position ?? 0) - (current?.position ?? 0)) -
        Math.abs((b.position ?? 0) - (current?.position ?? 0))
      );
      const top = candidates.slice(0, Math.min(3, candidates.length));
      const idx = Math.floor(Math.random() * top.length);
      setOpponent(top[idx]);
    }
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
              <div>
                <a className="pill link small" href={album.itunes_url} target="_blank" rel="noreferrer">
                  View on Apple
                </a>
              </div>
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
          <p className="eyebrow">Lists</p>
          <h2>{selectedList?.name ?? ranking?.name ?? "Select list"}</h2>
          <div className="form-row">
            <select className="input" value={selectedRanking ?? ""} onChange={(e) => setSelectedRanking(e.target.value)}>
              {selectableLists?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.kind === "year" && r.year ? `${r.year}` : r.name}
                  {membershipSet.has(r.id) ? " ✓" : ""}
                </option>
              ))}
            </select>
            <button className="button" onClick={toggleMembership} disabled={!selectedRanking}>
              {isMember ? "Remove from list" : "Add to list"}
            </button>
          </div>
        </header>
        <div className="muted">
          {isMember
            ? selectedList?.mode === "collection"
              ? "This album is in this collection."
              : "This album is counted in this ranked list."
            : "Not in this list. Add it to include."}
        </div>
      </section>

      {isRankedList && (
        <section className="card">
          <header className="card-header">
            <p className="eyebrow">This-or-that</p>
            <h2>Compare within this ranking</h2>
          </header>
          {!opponent && <div className="muted">Need at least one other album in this ranking to compare.</div>}
          {opponent && (
            <div className="comparison">
              <div className="compare-col">
                {album.artwork_thumb_path && (
                  <img src={albumImage(album.artwork_thumb_path)} alt={album.title} className="compare-img" />
                )}
                <div className="album-title">{album.title}</div>
                <div className="album-artist">{album.artist}</div>
                <button
                  className="button primary"
                  onClick={() => handleCompare(album.id)}
                  disabled={(comparisonMutation as any).isPending}
                >
                  This one wins
                </button>
              </div>
              <div className="compare-col">
                {opponent.album?.artwork_thumb_path && (
                  <img
                    src={albumImage(opponent.album.artwork_thumb_path)}
                    alt={opponent.album.title}
                    className="compare-img"
                  />
                )}
                <div className="album-title">{opponent.album?.title ?? "Unknown"}</div>
                <div className="album-artist">{opponent.album?.artist ?? ""}</div>
                <button
                  className="button ghost"
                  onClick={() => handleCompare(opponent.album_id)}
                  disabled={(comparisonMutation as any).isPending}
                >
                  Opponent wins
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default AlbumPage;
