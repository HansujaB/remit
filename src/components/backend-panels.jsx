import { useEffect, useState } from "react";
import { useApi, userMessage } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function AskPanel({ query, topic, platform, favorite, onOpen }) {
  const api = useApi();
  const [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setResult(null);
    setError("");
  }, [query, topic, platform, favorite]);
  async function ask() {
    setBusy(true);
    setError("");
    try {
      setResult(
        await api("/ask", {
          method: "POST",
          body: { query, topic, platform, favorite },
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!api) return null;
  return (
    <section className="backend-panel" aria-label="Ask your library">
      <Button
        className="button primary"
        disabled={busy || !query.trim()}
        onClick={ask}
      >
        {busy ? "Finding evidence…" : "Ask your saves"}
      </Button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div aria-live="polite">
          <p style={{ whiteSpace: "pre-wrap" }}>{result.answer}</p>
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
export function EvidencePanel({ item, onRefresh }) {
  const api = useApi();
  const [evidence, setEvidence] = useState(null),
    [error, setError] = useState("");
  if (!api) return null;
  return (
    <section className="backend-panel">
      <p>
        Processing: {item.status}
      </p>
      <p className="muted small-text">
        Extraction: {item.coverage === 'full supported extraction' ? 'Text extracted' : item.coverage}
      </p>
      {item.error && <p role="alert">{userMessage(item.error)}</p>}
      {item.status === "complete" && !item.topics?.length && (
        <p>No topics are available for this save yet.</p>
      )}
      <details
        onToggle={async (e) => {
          if (e.currentTarget.open && !evidence)
            try {
              setEvidence(await api(`/items/${item.id}/evidence`));
            } catch (err) {
              setError(err.message);
            }
        }}
      >
        <summary>Why this collection?</summary>
        {error && <p role="alert">{error}</p>}
        {evidence?.assignments.map((a) => (
          <div key={a.topic}>
            <strong>{a.topic}</strong>
            <p>{a.assignment.reason}</p>
            {a.assignment.evidence && (
              <blockquote>{a.assignment.evidence}</blockquote>
            )}
          </div>
        ))}
        {evidence?.chunks.map((c) => (
          <div key={c.id}>
            <small>{c.location}</small>
            <p>{c.concepts.join(" · ")}</p>
          </div>
        ))}
      </details>
    </section>
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
