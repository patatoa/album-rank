import "./index.css";

const quickActions = [
  { title: "Add albums", description: "Search iTunes or add manual entries with cover uploads." },
  { title: "Build rankings", description: "Create year lists and custom lists with drag/drop ordering." },
  { title: "This-or-that", description: "Run pairwise comparisons to refine Elo suggestions." }
];

function App() {
  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">AlbumRanker v1</p>
        <h1>Track albums, rank them, and compare what you love.</h1>
        <p className="lede">
          React + Supabase starter aligned to the spec in AGENTS.md. Hook up your Supabase project,
          then build the add, ranking grid, and album detail routes.
        </p>
        <div className="cta-row">
          <button className="button primary">Start building</button>
          <button className="button ghost">View spec</button>
        </div>
      </header>

      <section className="card">
        <div className="card-header">
          <h2>What is here</h2>
          <p>Vite + React + TS scaffold, Supabase folders, and Edge Function stubs.</p>
        </div>
        <div className="grid">
          {quickActions.map((item) => (
            <div className="pill" key={item.title}>
              <div className="pill-title">{item.title}</div>
              <div className="pill-desc">{item.description}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Next steps</h2>
          <ol className="steps">
            <li>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.</li>
            <li>Run Supabase locally with supabase start and apply migrations.</li>
            <li>Implement the /add, /rankings/:id, and /albums/:id flows.</li>
          </ol>
        </div>
      </section>
    </main>
  );
}

export default App;
