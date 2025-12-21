import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { RankingItem } from "../types";

const bucket = "album-art";

const albumImage = (path: string | null | undefined) => {
  if (!path) return "";
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

const fetchPublicRanking = async (slug: string) => {
  const { data, error } = await supabase.functions.invoke("ranking_public_get", { body: { slug } });
  if (error) throw error;
  return data as { ranking: { id: string; name: string; kind: string; year: number | null }; items: RankingItem[] };
};

const PublicRankingPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["publicRanking", slug],
    queryFn: () => fetchPublicRanking(slug ?? ""),
    enabled: !!slug
  });

  if (data) {
    console.log("public ranking", data);
  }

  if (isLoading) return <div className="card">Loading ranking…</div>;
  if (isError || !data)
    return (
      <div className="page public-wrap">
        <section className="card">
          <p className="eyebrow">Share</p>
          <div className="muted">Ranking not found or not public.</div>
          <div className="pill-row" style={{ marginTop: 12 }}>
            <button className="button ghost" onClick={() => navigate("/add")}>
              Sign in
            </button>
          </div>
        </section>
      </div>
    );

  return (
    <div className="page public-wrap">
      <section className="card">
        <header className="card-header">
          <div className="flex-between">
            <div>
              <p className="eyebrow">Shared ranking</p>
              <h2>{data.ranking.name}</h2>
              {data.ranking.kind === "year" && data.ranking.year && <div className="pill">Year: {data.ranking.year}</div>}
            </div>
            <button className="button ghost" onClick={() => navigate("/add")}>
              Sign in
            </button>
          </div>
        </header>
        {data.items.length === 0 && <div className="muted">No albums yet.</div>}
        {data.items.length > 0 && (
          <div className="album-grid">
            {data.items.map((item) => (
              <div key={item.album_id} className="album-card" onClick={() => navigate(`/albums/${item.album_id}`)}>
                <div className="album-rank">#{item.position}</div>
                {item.album?.artwork_thumb_path ? (
                  <img src={albumImage(item.album.artwork_thumb_path)} alt={item.album.title} />
                ) : (
                  <div className="album-meta">No art</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default PublicRankingPage;
