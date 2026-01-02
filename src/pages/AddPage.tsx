import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  createManualAlbum,
  ensureRankingLists,
  getRankingLists,
  ingestItunesAlbum,
  searchItunes,
} from "../lib/api";
import { RankingList } from "../types";

const debounce = (value: string, delay: number) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
};

const defaultYearList = () => {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  return month === 11 ? now.getFullYear() + 1 : now.getFullYear();
};

const yearLabel = defaultYearList();

const SearchResult = ({
  result,
  onSelect,
}: {
  result: any;
  onSelect: (payload: any) => void;
}) => (
  <button className="result" onClick={() => onSelect(result)}>
    <img src={result.artworkUrl60} alt={result.collectionName} />
    <div className="result-info">
      <div className="result-title">{result.collectionName}</div>
      <div className="result-artist">{result.artistName}</div>
    </div>
  </button>
);

const AddPage = () => {
  const [term, setTerm] = useState("");
  const debounced = debounce(term, 300);
  const [includeInList, setIncludeInList] = useState(true);
  const [targetListId, setTargetListId] = useState<string | null>(null);

  const [manualTitle, setManualTitle] = useState("");
  const [manualArtist, setManualArtist] = useState("");
  const [manualYear, setManualYear] = useState<number | undefined>();
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: rankings } = useQuery({
    queryKey: ["rankingLists"],
    queryFn: getRankingLists,
  });

  useEffect(() => {
    if (rankings) {
      console.log("rankingLists", rankings);
    }
  }, [rankings]);

  useEffect(() => {
    ensureRankingLists([yearLabel], ["All Time"])
      .then((lists) => {
        queryClient.setQueryData(["rankingLists"], lists);
      })
      .catch((err) => {
        console.error("ensureRankingLists failed", err);
      });
  }, [queryClient]);

  const rankingOptions = useMemo(() => rankings ?? [], [rankings]);

  useEffect(() => {
    if (rankingOptions.length > 0 && !targetListId) {
      const yearMatch = rankingOptions.find(
        (r) => r.kind === "year" && r.year === yearLabel
      );
      setTargetListId(yearMatch?.id ?? rankingOptions[0]?.id ?? null);
    }
  }, [rankingOptions, targetListId]);

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ["itunesSearch", debounced],
    queryFn: () => searchItunes(debounced),
    enabled: debounced.length > 2,
  });

  const ingestMutation = useMutation({
    mutationFn: ingestItunesAlbum,
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["rankingItems", targetListId],
      });
      if (includeInList && targetListId) {
        navigate(`/rankings/${targetListId}`);
      } else {
        navigate(`/albums/${data.albumId}`);
      }
    },
    onError: (err) => {
      console.error("Failed to ingest iTunes album", err);
      alert("Failed to add album. Please try again.");
    },
  });

  const manualMutation = useMutation({
    mutationFn: createManualAlbum,
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["rankingItems", targetListId],
      });
      if (includeInList && targetListId) {
        navigate(`/rankings/${targetListId}`);
      } else {
        navigate(`/albums/${data.albumId}`);
      }
    },
    onError: (err) => {
      console.error("Failed to create manual album", err);
      alert("Failed to add album. Please try again.");
    },
  });

  const toBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSelectItunes = (result: any) => {
    ingestMutation.mutate({
      itunes: {
        collectionId: result.collectionId,
        collectionName: result.collectionName,
        artistName: result.artistName,
        releaseDate: result.releaseDate,
        artworkUrl60: result.artworkUrl60,
        artworkUrl100: result.artworkUrl100,
        collectionViewUrl: result.collectionViewUrl,
      },
      targetListId,
      includeInList,
    });
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle || !manualArtist || !coverFile) return;
    const coverBase64 = await toBase64(coverFile);

    manualMutation.mutate({
      title: manualTitle,
      artist: manualArtist,
      releaseYear: manualYear,
      coverBase64,
      targetListId,
      includeInList,
    });
  };

  return (
    <div className="page-grid">
      <section className="card">
        <header className="card-header">
          <p className="eyebrow">Add album</p>
          <h2>Search</h2>
          <p>Type to find albums, then choose how it counts toward rankings.</p>
        </header>
        <div className="form-row">
          <input
            className="input"
            placeholder="Search albums…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <div className="ranking-select">
            <label>Add to list</label>
            <select
              value={targetListId ?? ""}
              onChange={(e) => setTargetListId(e.target.value)}
              className="input"
              disabled={rankingOptions.length === 0}
            >
              {rankingOptions.map((r: RankingList) => (
                <option key={r.id} value={r.id}>
                  {r.kind === "year" && r.year ? `${r.year}` : r.name}
                </option>
              ))}
            </select>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!includeInList}
                onChange={(e) => setIncludeInList(!e.target.checked)}
              />
              Don&apos;t add to a list
            </label>
          </div>
        </div>
        <div className="results">
          {isLoading && <div className="muted">Searching…</div>}
          {!isLoading &&
            searchResults?.length === 0 &&
            debounced.length > 2 && <div className="muted">No results</div>}
          {searchResults?.map((r: any) => (
            <SearchResult
              key={r.collectionId}
              result={r}
              onSelect={handleSelectItunes}
            />
          ))}
          {ingestMutation.isPending && (
            <div className="muted">
              <span className="spinner" /> Adding album…
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <p className="eyebrow">Manual</p>
          <h2>Add manually</h2>
          <p>For missing albums, upload art and fill in the details.</p>
        </header>
        <form className="form" onSubmit={handleManualSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>Title</span>
              <input
                className="input"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Artist</span>
              <input
                className="input"
                value={manualArtist}
                onChange={(e) => setManualArtist(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Release year</span>
              <input
                className="input"
                type="number"
                value={manualYear ?? ""}
                onChange={(e) =>
                  setManualYear(
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
              />
            </label>
          </div>
          <label className="field">
            <span>Cover image</span>
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <button
            className="button primary"
            type="submit"
            disabled={(manualMutation as any).isPending}
          >
            {(manualMutation as any).isPending ? "Saving…" : "Create album"}
          </button>
        </form>
      </section>
    </div>
  );
};

export default AddPage;
