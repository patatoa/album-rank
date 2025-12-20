import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ensureRankingLists, getRankingLists } from "../lib/api";

const RankingLandingPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: rankings, isLoading } = useQuery({
    queryKey: ["rankingLists"],
    queryFn: getRankingLists
  });

  useEffect(() => {
    // Ensure defaults exist, then cache and redirect to first list
    ensureRankingLists([], ["All Time"])
      .then((lists) => {
        queryClient.setQueryData(["rankingLists"], lists);
        if (lists.length > 0) {
          navigate(`/rankings/${lists[0].id}`, { replace: true });
        }
      })
      .catch((err) => {
        console.error("ensureRankingLists failed", err);
      });
  }, [navigate, queryClient]);

  if (isLoading) {
    return (
      <div className="card">
        <div className="muted">Loading rankings…</div>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="eyebrow">Rankings</p>
      {rankings && rankings.length === 0 ? (
        <div className="muted">No rankings yet. Add an album to create your lists.</div>
      ) : (
        <div className="muted">Pick a ranking from the list.</div>
      )}
    </div>
  );
};

export default RankingLandingPage;
