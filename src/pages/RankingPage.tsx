import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { FiShare2, FiClipboard, FiEyeOff } from "react-icons/fi";
import {
  getRankingItems,
  getRankingList,
  getRankingLists,
  ensureRankingLists,
  reorderRanking,
  shareRanking,
  unshareRanking
} from "../lib/api";
import { RankingItem } from "../types";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../lib/supabaseClient";

const bucket = "album-art";

const albumImage = (path: string | null | undefined) => {
  if (!path) return "";
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

type ComparisonPair = {
  left: RankingItem;
  right: RankingItem;
};

const SortableCard = ({ item }: { item: RankingItem }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.album_id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const album = item.album;
  return (
    <div className="album-card" ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div className="album-rank">#{item.position}</div>
      {album ? (
        <img src={albumImage(album.artwork_thumb_path)} alt={album.title} />
      ) : (
        <div className="album-meta">Missing album data</div>
      )}
    </div>
  );
};

const RankingPage = () => {
  const { rankingListId } = useParams<{ rankingListId: string }>();
  const navigate = useNavigate();
  const [sortMode, setSortMode] = useState<"rank" | "added">("rank");
  const [localItems, setLocalItems] = useState<RankingItem[]>([]);
  const [previousOrder, setPreviousOrder] = useState<string[] | null>(null);
  const [publicSlug, setPublicSlug] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const queryClient = useQueryClient();

  const { data: rankingLists } = useQuery({
    queryKey: ["rankingLists"],
    queryFn: getRankingLists
  });

  useEffect(() => {
    ensureRankingLists([], ["All Time"])
      .then((lists) => queryClient.setQueryData(["rankingLists"], lists))
      .catch((err) => console.error("ensureRankingLists failed", err));
  }, [queryClient]);

  const { data: ranking, isLoading: rankingLoading } = useQuery({
    queryKey: ["ranking", rankingListId],
    queryFn: () => getRankingList(rankingListId ?? ""),
    enabled: !!rankingListId
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["rankingItems", rankingListId],
    queryFn: () => getRankingItems(rankingListId ?? ""),
    enabled: !!rankingListId
  });

  const reorderMutation = useMutation({
    mutationFn: reorderRanking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rankingItems", rankingListId] });
    },
    onError: (err) => {
      console.error("Reorder failed", err);
    }
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (itemsData) {
      setLocalItems(itemsData);
    } else {
      setLocalItems([]);
    }
  }, [itemsData]);

  const sortedItems = useMemo(() => {
    const base = [...localItems];
    if (sortMode === "added") {
      return base.sort((a, b) => {
        const aTime = a.added_at ? new Date(a.added_at).getTime() : 0;
        const bTime = b.added_at ? new Date(b.added_at).getTime() : 0;
        return bTime - aTime;
      });
    }
    return base.sort((a, b) => a.position - b.position);
  }, [localItems, sortMode]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (sortMode === "added") return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setPreviousOrder(localItems.map((i) => i.album_id));

    const currentIndex = localItems.findIndex((item) => item.album_id === active.id);
    const overIndex = localItems.findIndex((item) => item.album_id === over.id);
    const newItems = arrayMove(localItems, currentIndex, overIndex).map((item, idx) => ({
      ...item,
      position: idx + 1
    }));
    const orderedAlbumIds = newItems.map((i) => i.album_id);
    setLocalItems(newItems);
    reorderMutation.mutate({ rankingListId: rankingListId!, orderedAlbumIds });
  };

  const copyLink = async (slug: string) => {
    const url = `${window.location.origin}/share/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore; user still sees the link in the UI
    }
  };

  const shareLink = async (slug: string) => {
    const url = `${window.location.origin}/share/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: ranking?.name ?? "Album ranking", url });
        return;
      } catch {
        // fall through to copy if user cancels or share fails
      }
    }
    await copyLink(slug);
  };

  const shareMutation = useMutation({
    mutationFn: shareRanking,
    onSuccess: (data) => {
      setPublicSlug(data?.publicSlug ?? null);
      setIsPublic(data?.isPublic ?? false);
      if (data?.publicSlug) {
        shareLink(data.publicSlug);
      }
    },
    onError: (err) => {
      console.error("Share failed", err);
    }
  });

  const unshareMutation = useMutation({
    mutationFn: unshareRanking,
    onSuccess: (data) => {
      setPublicSlug(null);
      setIsPublic(false);
    },
    onError: (err) => {
      console.error("Unshare failed", err);
    }
  });

  useEffect(() => {
    if (ranking?.public_slug) {
      setPublicSlug(ranking.public_slug);
      setIsPublic(ranking.is_public ?? false);
    } else {
      setPublicSlug(null);
      setIsPublic(false);
    }
  }, [ranking]);

  const handleRankingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id) navigate(`/rankings/${id}`);
  };

  return (
    <div className="page-grid">
      <section className="card">
        <header className="card-header">
          <p className="eyebrow">Ranking</p>
          <div className="flex-between">
            <h2>{ranking?.name ?? "Ranking"}</h2>
            <select className="input" value={rankingListId} onChange={handleRankingChange}>
              {rankingLists?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.kind === "year" && r.year ? `${r.year}` : r.name}
                </option>
              ))}
            </select>
            <div className="pill-row">
              {!isPublic ? (
                <button
                  className="button icon-btn"
                  aria-label="Share ranking"
                  onClick={() => rankingListId && shareMutation.mutate(rankingListId)}
                  disabled={shareMutation.isPending}
                >
                  <FiShare2 />
                </button>
              ) : (
                <>
                  <button
                    className="button ghost icon-btn"
                    aria-label="Make private"
                    onClick={() => rankingListId && unshareMutation.mutate(rankingListId)}
                    disabled={unshareMutation.isPending}
                  >
                    <FiEyeOff />
                  </button>
                  {publicSlug && (
                    <div className="pill-row">
                      <span className="pill">{`${window.location.origin}/share/${publicSlug}`}</span>
                      <button
                        className="pill-btn icon-btn"
                        aria-label="Copy share link"
                        onClick={() => copyLink(publicSlug)}
                      >
                        <FiClipboard />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="pill-row">
            <button
              className={sortMode === "rank" ? "pill-btn active" : "pill-btn"}
              onClick={() => setSortMode("rank")}
            >
              Rank
            </button>
            <button
              className={sortMode === "added" ? "pill-btn active" : "pill-btn"}
              onClick={() => setSortMode("added")}
            >
              Added
            </button>
          </div>
        </header>
        {(rankingLoading || itemsLoading) && <div className="muted">Loading ranking…</div>}
        {!itemsLoading && sortedItems.length === 0 && <div className="muted">No albums yet. Add some on the /add page.</div>}
        {!itemsLoading && sortedItems.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedItems.map((i) => i.album_id)} strategy={horizontalListSortingStrategy}>
              <div className="album-grid">
                {sortedItems.map((item) => (
                  <div key={item.album_id} onClick={() => navigate(`/albums/${item.album_id}?ranking=${rankingListId}`)}>
                    <SortableCard item={item} />
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

      </section>
      {previousOrder && (
        <div className="card">
          <div className="pill-row">
            <button
              className="button ghost"
              onClick={() => {
                if (!rankingListId || !previousOrder) return;
                reorderMutation.mutate({ rankingListId, orderedAlbumIds: previousOrder });
                setPreviousOrder(null);
              }}
            >
              Undo last reorder
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RankingPage;
