import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { FiShare2, FiEyeOff } from "react-icons/fi";
import {
  getRankingItems,
  getNeedsListeningItems,
  getRankingList,
  getRankingLists,
  ensureRankingLists,
  reorderRanking,
  shareRanking,
  unshareRanking,
  createList,
  updateList,
  deleteList,
  getUserPreferences,
  setDisplayName
} from "../lib/api";
import { RankingItem, RankingList } from "../types";
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
      <div className="album-rank">#{item.position ?? "•"}</div>
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
  const [sortMode, setSortMode] = useState<"rank" | "added" | "title" | "artist" | "year">("rank");
  const [localItems, setLocalItems] = useState<RankingItem[]>([]);
  const [previousOrder, setPreviousOrder] = useState<string[] | null>(null);
  const [publicSlug, setPublicSlug] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListMode, setNewListMode] = useState<"ranked" | "collection">("ranked");
  const [newListDescription, setNewListDescription] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "listening" | "not_listened" | "listened">("all");
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const queryClient = useQueryClient();

  const { data: rankingLists } = useQuery({
    queryKey: ["rankingLists"],
    queryFn: getRankingLists
  });
  const { data: prefs } = useQuery({ queryKey: ["userPreferences"], queryFn: getUserPreferences });

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

  useEffect(() => {
    if (ranking?.mode === "collection" && sortMode === "rank") {
      setSortMode("added");
    } else if (ranking?.mode === "ranked" && sortMode !== "rank" && sortMode !== "added") {
      setSortMode("rank");
    }
  }, [ranking, sortMode]);

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["rankingItems", rankingListId, ranking?.mode, ranking?.name],
    queryFn: () => {
      if (ranking?.mode === "collection" && ranking?.name === "Needs listening") {
        return getNeedsListeningItems(rankingListId ?? "");
      }
      return getRankingItems(rankingListId ?? "");
    },
    enabled: !!rankingListId && ranking !== undefined
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
    let base = [...localItems];

    if (statusFilter !== "all") {
      base = base.filter((i) => i.user_status === statusFilter);
    }

    if (ranking?.mode === "collection" && ranking.name === "Needs listening") {
      return base
        .sort((a, b) => {
          const order = (status?: string) => (status === "listening" ? 0 : status === "not_listened" ? 1 : 2);
          const diff = order(a.user_status) - order(b.user_status);
          if (diff !== 0) return diff;
          const aTime = a.added_at ? new Date(a.added_at).getTime() : 0;
          const bTime = b.added_at ? new Date(b.added_at).getTime() : 0;
          return bTime - aTime;
        });
    }
    if (sortMode === "added") {
      return base.sort((a, b) => {
        const aTime = a.added_at ? new Date(a.added_at).getTime() : 0;
        const bTime = b.added_at ? new Date(b.added_at).getTime() : 0;
        return bTime - aTime;
      });
    }
    if (sortMode === "title") {
      return base.sort((a, b) => (a.album?.title ?? "").localeCompare(b.album?.title ?? ""));
    }
    if (sortMode === "artist") {
      return base.sort((a, b) => (a.album?.artist ?? "").localeCompare(b.album?.artist ?? ""));
    }
    if (sortMode === "year") {
      return base.sort((a, b) => (a.album?.release_year ?? 0) - (b.album?.release_year ?? 0));
    }
    return base.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [localItems, sortMode, statusFilter, ranking?.mode, ranking?.name]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (ranking?.mode === "collection") return;
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

  const createListMutation = useMutation({
    mutationFn: createList,
    onSuccess: (list) => {
      queryClient.invalidateQueries({ queryKey: ["rankingLists"] });
      setShowNewList(false);
      setNewListName("");
      setNewListDescription("");
      setNewListMode("ranked");
      navigate(`/rankings/${list.id}`);
    },
    onError: (err) => console.error("Create list failed", err)
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateList(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rankingLists"] });
      queryClient.invalidateQueries({ queryKey: ["ranking", rankingListId] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteList,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rankingLists"] });
      const lists = queryClient.getQueryData<RankingList[]>(["rankingLists"]);
      if (lists && lists.length > 0) {
        navigate(`/rankings/${lists[0].id}`, { replace: true });
      } else {
        navigate("/add", { replace: true });
      }
    }
  });

  const setDisplayNameMutation = useMutation({
    mutationFn: (name: string) => setDisplayName(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
    }
  });

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
    onSuccess: () => {
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

  const isRanked = ranking?.mode !== "collection";

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
              <button className="button ghost" onClick={() => setShowNewList(true)}>
                + New list…
              </button>
              <div className="pill-row">
                {!isPublic ? (
                <button
                  className="button icon-btn"
                  aria-label="Share ranking"
                  onClick={() => {
                    if (!prefs?.display_name || prefs.display_name.trim().length === 0) {
                      setShowNameModal(true);
                      return;
                    }
                    rankingListId && shareMutation.mutate(rankingListId);
                  }}
                  disabled={shareMutation.isPending}
                >
                  <FiShare2 />
                </button>
              ) : (
                <>
                  <div className="pill-row">
                    {publicSlug && (
                      <button
                        className="button icon-btn"
                        aria-label="Share link"
                        onClick={() => shareLink(publicSlug)}
                      >
                        <FiShare2 />
                      </button>
                    )}
                    <button
                      className="button ghost icon-btn"
                      aria-label="Make private"
                      onClick={() => rankingListId && unshareMutation.mutate(rankingListId)}
                      disabled={unshareMutation.isPending}
                    >
                      <FiEyeOff />
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="pill-row">
              <button
                className="pill-btn"
                onClick={() => {
                  const newName = window.prompt("Rename list", ranking?.name ?? "");
                  if (newName && rankingListId) {
                    renameMutation.mutate({ id: rankingListId, name: newName });
                  }
                }}
              >
                Rename
              </button>
              <button
                className="pill-btn"
                onClick={() => {
                  if (rankingListId && window.confirm("Delete this list? This removes its items but not albums.")) {
                    deleteMutation.mutate(rankingListId);
                  }
                }}
              >
                Delete
              </button>
              {ranking?.mode === "collection" && <span className="pill">Collection</span>}
            </div>
          </div>
          {isRanked ? (
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
          ) : (
            <div className="pill-row">
              {ranking?.name === "Needs listening" ? (
                <span className="pill">Auto-sorted (Listening → Not listened, newest first)</span>
              ) : (
                ["added", "title", "artist", "year"].map((mode) => (
                  <button
                    key={mode}
                    className={sortMode === mode ? "pill-btn active" : "pill-btn"}
                    onClick={() => setSortMode(mode as any)}
                  >
                    {mode === "added" ? "Added" : mode === "title" ? "Title" : mode === "artist" ? "Artist" : "Year"}
                  </button>
                ))
              )}
            </div>
          )}
          <div className="pill-row">
            <span className="pill">Filters</span>
            {(["all", "listening", "not_listened", "listened"] as const).map((status) => (
              <button
                key={status}
                className={statusFilter === status ? "pill-btn active" : "pill-btn"}
                onClick={() => setStatusFilter(status)}
              >
                {status === "all" ? "All" : status === "not_listened" ? "Not listened" : status === "listening" ? "Listening" : "Listened"}
              </button>
            ))}
          </div>
        </header>
        {(rankingLoading || itemsLoading) && <div className="muted">Loading ranking…</div>}
        {!itemsLoading && sortedItems.length === 0 && <div className="muted">No albums yet. Add some on the /add page.</div>}
        {!itemsLoading && sortedItems.length > 0 && (
          <>
            {isRanked ? (
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
            ) : (
              <div className="album-grid">
                {sortedItems.map((item) => (
                  <div key={item.album_id} onClick={() => navigate(`/albums/${item.album_id}?ranking=${rankingListId}`)}>
                    <SortableCard item={item} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </section>
      {previousOrder && isRanked && (
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
      {showNewList && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>New list</h3>
              <button className="bubble-close" onClick={() => setShowNewList(false)}>
                ×
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Name</span>
                <input
                  className="input"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Mode</span>
                <select
                  className="input"
                  value={newListMode}
                  onChange={(e) => setNewListMode(e.target.value as "ranked" | "collection")}
                >
                  <option value="ranked">Ranked</option>
                  <option value="collection">Collection</option>
                </select>
              </label>
              <label className="field">
                <span>Description (optional)</span>
                <textarea
                  className="input"
                  rows={3}
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                />
              </label>
            </div>
            <div className="pill-row" style={{ marginTop: 12 }}>
              <button
                className="button"
                onClick={() => {
                  if (!newListName.trim()) return;
                  createListMutation.mutate({
                    name: newListName.trim(),
                    mode: newListMode,
                    description: newListDescription.trim() ? newListDescription.trim() : null
                  });
                }}
                disabled={createListMutation.isPending}
              >
                Create
              </button>
              <button className="button ghost" onClick={() => setShowNewList(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showNameModal && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="display-name-title"
            aria-describedby="display-name-desc"
          >
            <div className="modal-header">
              <h3 id="display-name-title">Set display name</h3>
              <button className="bubble-close" aria-label="Close" onClick={() => setShowNameModal(false)}>
                ×
              </button>
            </div>
            <p className="muted small" id="display-name-desc">
              This name appears on shared lists. You can update it anytime in Settings.
            </p>
            <label className="field">
              <span>Display name</span>
              <input
                className="input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your name"
              />
            </label>
            <div className="pill-row" style={{ marginTop: 12 }}>
              <button
                className="button"
                onClick={() => {
                  if (!nameInput.trim()) return;
                  setDisplayNameMutation.mutate(nameInput.trim(), {
                    onSuccess: () => {
                      setShowNameModal(false);
                      if (rankingListId) shareMutation.mutate(rankingListId);
                    }
                  });
                }}
              >
                Save & share
              </button>
              <button className="button ghost" onClick={() => setShowNameModal(false)} aria-label="Cancel">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RankingPage;
