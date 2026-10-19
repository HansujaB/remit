import { useEffect, useState, useRef } from "react";
import { useApi, userMessage } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function AskPanel({ query, topic, platform, favorite, onOpen }) {
  const api = useApi();
  const requestVersion = useRef(0);
  const [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    requestVersion.current++;
    setBusy(false);
    setResult(null);
    setError("");
  }, [query, topic, platform, favorite]);
  async function ask(followup = '') {
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await api("/ask", {
          method: "POST",
          body: { query: followup ? `${query}\nFocus: ${followup}` : query, topic, platform, favorite },
        });
      if (version === requestVersion.current) setResult(response);
    } catch (e) {
      if (version === requestVersion.current) setError(e.message);
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }
  if (!api) return null;
  return (
    <section className="backend-panel ask-panel" aria-label="Ask your library">
      <Button
        className="button primary"
        disabled={busy || !query.trim()}
        onClick={() => ask()}
      >
        {busy ? "Finding evidence…" : "Ask your saves"}
      </Button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div aria-live="polite">
          <p style={{ whiteSpace: "pre-wrap" }}>{result.answer}</p>
          {!!result.matches?.length && <div className="ask-matches">
            {result.matches.map(item => <button className="ask-match" key={item.id} onClick={() => onOpen(item.id)}>
              <strong>{(!item.title || /^(www\.|https?:)/.test(item.title)) ? (item.topics?.[0] || 'Saved item') : item.title}</strong>
              <span>{item.platform}</span>
              {item.reason && <p className="ask-match-reason">{item.reason}</p>}
            </button>)}
          </div>}
          {result.clarification && <form className="ask-clarification" onSubmit={e => {
            e.preventDefault(); const text = new FormData(e.currentTarget).get('focus');
            if (String(text || '').trim()) ask(String(text));
          }}>
            <label htmlFor="ask-focus">{result.clarification}</label>
            <div className="ask-refine-row"><Input id="ask-focus" name="focus" maxLength={200} placeholder="Add a little context…" required />
            <Button className="button secondary" disabled={busy}>Refine</Button></div>
          </form>}
          {!!result.trace?.length && <details className="ask-trace">
            <summary>How I found this · FalkorDB</summary>
            <ol>{result.trace.map((step, index) => <li key={index}>
              <div><strong>{{list_topics:'Reviewed your topics',explore_topics:'Explored relevant collections',search_saves:'Searched saved content',find_connected_saves:'Checked graph connections',check_relevance:'Kept relevant saves',read_evidence:'Read supporting excerpts'}[step.tool] || step.tool}</strong>
              <span>{step.count} {step.tool === 'list_topics' ? 'topics' : step.tool === 'find_connected_saves' ? 'connections checked' : 'results'}</span></div>
              {step.tool !== 'list_topics' && !!step.topics?.length && <p>{step.topics.join(' · ')}</p>}
              {!!step.connections?.length && <p>{[...new Set(step.connections.map(p=>p.concept))].join(' · ')}</p>}
              <code>{step.tool}</code>
            </li>)}</ol>
          </details>}
          {result.claims?.map((claim, i) => (
            <div key={i} className="answer-citations">
              {claim.citations.map((ref) => {
                const source = result.sources.find((s) => s.id === ref.id);
                return (
                  source && (
                    <Button
                      className="text-button"
                      key={ref.id}
                      onClick={() => onOpen(source.itemId)}
                    >
                      {source.title} · {source.location}
                    </Button>
                  )
                );
              })}
            </div>
          ))}
          {!!result.sources?.length && (
            <details>
              <summary>Sources and connections</summary>
              {result.sources.map((s) => (
                <blockquote key={s.id}>
                  <p>{s.text}</p>
                  <small>
                    {s.title} · {s.location}
                    {s.derived ? " · Text extracted from image" : ""}
                  </small>
                </blockquote>
              ))}
              {result.paths.map((p, i) => (
                <p key={i}>
                  {result.sources.find((s) => s.itemId === p.from)?.title ||
                    "Related save"}{" "}
                  → {p.concept} →{" "}
                  {result.sources.find((s) => s.itemId === p.to)?.title ||
                    "Related save"}
                </p>
              ))}
            </details>
          )}
          {result.warnings?.map((w) => (
            <p key={w} className="muted">
              {w}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
export function EvidencePanel({ item }) {
  if (!item.error && item.status === "complete") return null;
  return (
    <div className="source-processing-status">
      {item.error ? <p role="alert">{userMessage(item.error)}</p> : <p className="muted small-text">Processing: {item.status}</p>}
    </div>
  );
}
export function PreferencesPanel({ onRefresh }) {
  const api = useApi();
  const [items, setItems] = useState([]),
    [text, setText] = useState(""),
    [scope, setScope] = useState("library"),
    [error, setError] = useState("");
  const load = () =>
    api("/preferences")
      .then(setItems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (api) load();
  }, [api]);
  if (!api) return null;
  return (
    <section className="backend-panel">
      <h3>Remembered instructions</h3>
      <p>
        Explicit preferences guide future organization. Use “library” or an
        exact topic name for the scope.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/preferences", {
              method: "POST",
              body: { text, scope },
            });
            setText("");
            await load();
            await onRefresh?.();
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <Input
          aria-label="Instruction to remember"
          placeholder="Keep Rangoli and Mandala separate"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          required
        />
        <Input
          aria-label="Instruction scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          required
        />
        <Button className="button secondary">Remember</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {items.map((p) => (
        <div className="preference-row" key={p.id}>
          <span>
            {p.text} <small>({p.scope})</small>
          </span>
          <Button
            className="text-button"
            onClick={async () => {
              try {
                await api(`/preferences/${p.id}`, { method: "DELETE" });
                await load();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Remove
          </Button>
        </div>
      ))}
    </section>
  );
}
