import { useRef, useState } from "react";
import {
  ArrowUp,
  Plus,
  Folder,
  Paperclip,
  X,
  LoaderCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input, Textarea } from "./ui/input";
const cx = (...values) => values.filter(Boolean).join(" ");

export function Composer({ topics, onSave, compact = false }) {
  const [text, setText] = useState(""),
    [files, setFiles] = useState([]),
    [chosenTopic, setChosenTopic] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dragging, setDragging] = useState(false);
  const input = useRef(null);
  function chooseFiles(list) {
    const accepted = [];
    let issue = "";
    for (const file of list) {
      if (
        ![
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
        ].includes(file.type)
      )
        issue = "Choose a PDF, PNG, JPG, WebP, or GIF file.";
      else if (file.size > 20 * 1024 * 1024)
        issue = "Please keep each file under 20 MB.";
      else accepted.push(file);
    }
    setFiles((prev) => [...prev, ...accepted].slice(0, 10));
    setError(issue);
  }
  async function submit(e) {
    e.preventDefault();
    if (busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    setError("");
    try {
      await onSave({ text, files, chosenTopic });
      setText("");
      setFiles([]);
    } catch (err) {
      setError(err.message || "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={cx("composer", compact && "compact", dragging && "dragging")}
      onSubmit={submit}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        chooseFiles([...e.dataTransfer.files]);
      }}
    >
      <Textarea
        aria-label="What would you like to save?"
        placeholder={
          compact
            ? "Found something worth keeping? Drop it here…"
            : "Paste a link, leave a thought, or drop a file…"
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(e);
        }}
        rows={compact ? 2 : 3}
      />
      {files.length > 0 && (
        <div className="attachment-list">
          {files.map((file, index) => (
            <span key={`${file.name}-${index}`}>
              <Paperclip size={13} />
              {file.name}
              <Button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((f) => f.filter((_, i) => i !== index))}
              >
                <X size={13} />
              </Button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-actions">
        <div>
          <Button
            type="button"
            className="icon-button"
            aria-label="Attach PDFs or pictures"
            onClick={() => input.current.click()}
          >
            <Plus size={20} />
          </Button>
          <Input
            ref={input}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              chooseFiles([...e.target.files]);
              e.target.value = "";
            }}
          />
          <span className="composer-divider" />
          <label className="topic-select">
            <Folder size={14} />
            <select
              aria-label="Save to topic"
              value={chosenTopic}
              onChange={(e) => setChosenTopic(e.target.value)}
            >
              <option value="">Choose a topic</option>
              {topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <span className="composer-hint">
            {compact ? "links, pictures, PDFs & thoughts" : "Ctrl / ⌘ + Enter"}
          </span>
          <Button
            className="send-button"
            aria-label="Save to library"
            disabled={busy || (!text.trim() && !files.length)}
          >
            {busy ? (
              <LoaderCircle className="spin" size={19} />
            ) : (
              <ArrowUp size={20} />
            )}
          </Button>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
