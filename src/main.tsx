import React from "react";
import { createRoot } from "react-dom/client";
import { Check, Database, ExternalLink, Film, Image, Loader2, Save, Search, X } from "lucide-react";
import "./styles.css";

type MediaType = "movie" | "tv";

type SearchResult = {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  releaseYear: string;
  posterPath: string;
  overview: string;
};

type MovieForm = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  localizedTitle: string;
  englishTitle: string;
  releaseYear: string;
  poster: string;
  posters: string[];
  directors: string[];
  cast: string[];
  tags: string[];
  overview: string;
  quality: string;
  resolution: string;
  sizeValue: string;
  sizeUnit: "GB" | "MB" | "TB";
  subtitles: string;
  link115: string;
  comment: string;
};

const qualityOptions = ["高清", "原盘", "标清", "AI修复"];
const resolutionOptions = ["4K", "1080P", "720P", "480P"];
const subtitleOptions = ["中文字幕", "英文字幕", "双语字幕", "无字幕"];
const sizeUnits: MovieForm["sizeUnit"][] = ["GB", "MB", "TB"];

function App() {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [selected, setSelected] = React.useState<MovieForm | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<{ type: "ok" | "error" | "info"; message: string; url?: string } | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSelected(null);
    setStatus(null);
    try {
      const data = await api<{ results: SearchResult[] }>(`/api/search?query=${encodeURIComponent(query.trim())}`);
      setResults(data.results);
      if (data.results.length === 0) setStatus({ type: "info", message: "没有找到匹配的 TMDB 结果" });
    } catch (error) {
      setStatus({ type: "error", message: getMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  async function selectMovie(result: SearchResult) {
    setLoading(true);
    setStatus(null);
    try {
      const data = await api<{ movie: Omit<MovieForm, "quality" | "resolution" | "sizeValue" | "sizeUnit" | "subtitles" | "link115" | "comment"> }>(
        `/api/details/${result.mediaType}/${result.id}`
      );
      setSelected({
        ...data.movie,
        quality: "原盘",
        resolution: "1080P",
        sizeValue: "",
        sizeUnit: "GB",
        subtitles: "中文字幕",
        link115: "",
        comment: ""
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setStatus({ type: "error", message: getMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  async function syncToNotion() {
    if (!selected) return;
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        ...selected,
        size: selected.sizeValue.trim() ? `${selected.sizeValue.trim()} ${selected.sizeUnit}` : ""
      };
      const data = await api<{ mode: "created" | "updated"; url: string }>("/api/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setStatus({
        type: "ok",
        message: data.mode === "updated" ? "已更新 Notion 里的现有条目" : "已创建新的 Notion 条目",
        url: data.url
      });
    } catch (error) {
      setStatus({ type: "error", message: getMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Film size={18} /></div>
          <div>
            <strong>CineNotion</strong>
            <span>TMDB 到 Notion</span>
          </div>
        </div>
        <form className="searchbar" onSubmit={search}>
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索片名或输入 TMDB ID" />
          <button type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
            搜索
          </button>
        </form>
      </header>

      <main>
        {status && (
          <div className={`notice ${status.type}`}>
            <span>{status.type === "ok" ? <Check size={18} /> : status.type === "error" ? <X size={18} /> : <Database size={18} />}</span>
            <p>{status.message}</p>
            {status.url && (
              <a href={status.url} target="_blank" rel="noreferrer">
                打开 <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}

        {selected ? (
          <Editor movie={selected} setMovie={setSelected} saving={saving} onSync={syncToNotion} />
        ) : (
          <Results results={results} loading={loading} onSelect={selectMovie} />
        )}
      </main>
    </div>
  );
}

function Results({ results, loading, onSelect }: { results: SearchResult[]; loading: boolean; onSelect: (result: SearchResult) => void }) {
  if (loading && results.length === 0) {
    return <div className="empty"><Loader2 className="spin" /> 正在搜索 TMDB</div>;
  }

  if (results.length === 0) {
    return (
      <section className="empty">
        <Film size={32} />
        <p>从上方搜索开始。选择影片后，再填写大小、分辨率、字幕和 115 链接。</p>
      </section>
    );
  }

  return (
    <section className="result-grid">
      {results.map((result) => (
        <button className="movie-card" key={`${result.mediaType}-${result.id}`} onClick={() => onSelect(result)}>
          <div className="poster">
            {result.posterPath ? <img src={result.posterPath} alt={result.title} /> : <Image size={32} />}
          </div>
          <strong>{result.originalTitle || result.title}</strong>
          <span>{[result.title, result.releaseYear, result.mediaType === "tv" ? "剧集" : "电影"].filter(Boolean).join(" · ")}</span>
        </button>
      ))}
    </section>
  );
}

function Editor({
  movie,
  setMovie,
  saving,
  onSync
}: {
  movie: MovieForm;
  setMovie: React.Dispatch<React.SetStateAction<MovieForm | null>>;
  saving: boolean;
  onSync: () => void;
}) {
  const patch = (updates: Partial<MovieForm>) => setMovie((current) => (current ? { ...current, ...updates } : current));

  return (
    <section className="editor">
      <aside className="poster-panel">
        <div className="main-poster">{movie.poster ? <img src={movie.poster} alt={movie.title} /> : <Image size={48} />}</div>
        <div className="poster-strip">
          {movie.posters.slice(0, 10).map((poster) => (
            <button className={poster === movie.poster ? "active" : ""} key={poster} onClick={() => patch({ poster })}>
              <img src={poster} alt="" />
            </button>
          ))}
        </div>
      </aside>

      <div className="form-panel">
        <div className="title-row">
          <label>
            Notion 标题
            <input className="title-input" value={movie.title} onChange={(event) => patch({ title: event.target.value })} />
          </label>
          <button className="sync-button" onClick={onSync} disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
            同步到 Notion
          </button>
        </div>

        <div className="meta-line">
          <span>原名：{movie.originalTitle || "空白"}</span>
          <span>中文：{movie.localizedTitle || "空白"}</span>
          <span>TMDB：{movie.tmdbId}</span>
        </div>

        <div className="field-grid">
          <TextField label="发行年份" value={movie.releaseYear} onChange={(releaseYear) => patch({ releaseYear })} />
          <ChoiceField label="画质" value={movie.quality} options={qualityOptions} onChange={(quality) => patch({ quality })} />
          <ChoiceField label="分辨率" value={movie.resolution} options={resolutionOptions} onChange={(resolution) => patch({ resolution })} />
          <ChoiceField label="字幕" value={movie.subtitles} options={subtitleOptions} onChange={(subtitles) => patch({ subtitles })} />
          <SizeField movie={movie} patch={patch} />
          <TextField label="115链接" value={movie.link115} onChange={(link115) => patch({ link115 })} placeholder="https://115cdn.com/..." />
        </div>

        <TokenEditor label="导演" values={movie.directors} onChange={(directors) => patch({ directors })} />
        <TokenEditor label="演员" values={movie.cast} onChange={(cast) => patch({ cast })} />
        <TokenEditor label="标签" values={movie.tags} onChange={(tags) => patch({ tags })} />

        <label className="wide-field">
          点评
          <textarea value={movie.comment} onChange={(event) => patch({ comment: event.target.value })} placeholder="可留空，也可以写一句自己的备注" />
        </label>
      </div>
    </section>
  );
}

function TextField({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function ChoiceField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="choice-field">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button className={option === value ? "active" : ""} key={option} onClick={() => onChange(option)}>
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function SizeField({ movie, patch }: { movie: MovieForm; patch: (updates: Partial<MovieForm>) => void }) {
  return (
    <div className="size-field">
      <label>
        大小
        <input value={movie.sizeValue} onChange={(event) => patch({ sizeValue: event.target.value })} placeholder="22.85" />
      </label>
      <div>
        {sizeUnits.map((unit) => (
          <button className={unit === movie.sizeUnit ? "active" : ""} key={unit} onClick={() => patch({ sizeUnit: unit })}>
            {unit}
          </button>
        ))}
      </div>
    </div>
  );
}

function TokenEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  const [draft, setDraft] = React.useState("");

  function addToken() {
    const next = draft.trim();
    if (!next) return;
    onChange([...values, next].filter((value, index, array) => array.indexOf(value) === index));
    setDraft("");
  }

  return (
    <div className="token-editor">
      <span>{label}</span>
      <div className="tokens">
        {values.map((value) => (
          <button key={value} onClick={() => onChange(values.filter((item) => item !== value))}>
            {value}
            <X size={13} />
          </button>
        ))}
      </div>
      <div className="token-input">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addToken();
            }
          }}
          placeholder={`添加${label}`}
        />
        <button onClick={addToken}>添加</button>
      </div>
    </div>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data as T;
}

function getMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

createRoot(document.getElementById("root")!).render(<App />);
