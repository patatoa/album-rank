import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { getRankingItems, getRankingList, getRankingLists, ensureRankingLists, reorderRanking } from "../lib/api";
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
        <>
          <img src={albumImage(album.artwork_thumb_path)} alt={album.title} />
          <div className="album-meta">
            <div className="album-title">{album.title}</div>
            <div className="album-artist">{album.artist}</div>
          </div>
        </>
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

  const { data: ranking } = useQuery({
    queryKey: ["ranking", rankingListId],
    queryFn: () => getRankingList(rankingListId ?? ""),
    enabled: !!rankingListId
  });

  const { data: items = [] } = useQuery({
    queryKey: ["rankingItems", rankingListId],
    queryFn: () => getRankingItems(rankingListId ?? ""),
    enabled: !!rankingListId
  });

  const reorderMutation = useMutation({
    mutationFn: reorderRanking,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rankingItems", rankingListId] })
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const sortedItems = useMemo(() => {
    if (sortMode === "added") {
      return [...items].sort((a, b) => {
        const aTime = a.added_at ? new Date(a.added_at).getTime() : 0;
        const bTime = b.added_at ? new Date(b.added_at).getTime() : 0;
        return bTime - aTime;
      });
    }
    return items;
  }, [items, sortMode]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (sortMode === "added") return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIndex = items.findIndex((item) => item.album_id === active.id);
    const overIndex = items.findIndex((item) => item.album_id === over.id);
    const newItems = arrayMove(items, currentIndex, overIndex).map((item, idx) => ({
      ...item,
      position: idx + 1
    }));
    const orderedAlbumIds = newItems.map((i) => i.album_id);
    reorderMutation.mutate({ rankingListId: rankingListId!, orderedAlbumIds });
  };

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
        {sortedItems.length === 0 && <div className="muted">No albums yet. Add some on the /add page.</div>}
        {sortedItems.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.album_id)} strategy={horizontalListSortingStrategy}>
              <div className="album-grid">
                {sortedItems.map((item) => (
                  <SortableCard key={item.album_id} item={item} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>
    </div>
  );
};

export default RankingPage;
