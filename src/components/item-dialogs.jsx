import { useState } from "react";
import {
  Plus,
  Folder,
  X,
  Check,
  Link,
  Download,
  Trash2,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input, Textarea } from "./ui/input";
import { Modal } from "./modal";
import { useFileUrl } from "./save-card";
import { EvidencePanel, PreferencesPanel } from "./backend-panels";
import { useApi } from "../lib/api";
import { SourceIcon, Logo } from "./brand";

export function ItemDetail({
  item,
  topics,
  onClose,
  onSave,
  onDelete,
  onRefresh,
}) {
  const [title, setTitle] = useState(item.title),
    [notes, setNotes] = useState(item.notes || ""),
    [selectedTopics, setSelectedTopics] = useState(item.topics),
    [confirmDelete, setConfirmDelete] = useState(false);
  const fileUrl = useFileUrl(item.fileKey);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Saved item" onClose={onClose} wide>
      <div className="detail-layout">
        <div className="detail-preview">
          {item.kind === "image" && fileUrl ? (
            <img src={fileUrl} alt={item.title} />
          ) : (
            <div className="detail-generic">
              <SourceIcon platform={item.platform} size={60} />
            </div>
          )}
          <div className="source-status">
            <SourceIcon platform={item.platform} />
            <strong>{item.platform}</strong>
            <span>
              {item.sample
                ? "Illustrative sample"
                : item.kind === "note"
                  ? "Your note"
                  : item.fileKey
                    ? "Original file saved"
                    : "Link only"}
            </span>
          </div>
          <p>{item.description}</p>
          <EvidencePanel item={item} onRefresh={onRefresh} />
          {item.url && (
            <a
              className="button secondary"
              href={item.url}
              target="_blank"
              rel="noreferrer"
            >
              Open original <ExternalLink size={15} />
            </a>
          )}
          {item.fileKey &&
            (fileUrl ? (
              <a
                href={fileUrl}
                download={item.title}
                className="button secondary"
              >
                Download original <Download size={15} />
              </a>
            ) : (
              <p className="muted">
                Original file could not be loaded. Check your connection and try
                again.
              </p>
            ))}
        </div>
        <form
          className="detail-editor"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await onSave({
                title: title.trim() || item.title,
                notes,
                topics: selectedTopics,
              });
              onClose();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <p role="alert">{error}</p>}
          <label>
            Title
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <fieldset>
            <legend>Collections</legend>
            <div className="topic-checkboxes">
              {topics.map((topic) => (
                <label
                  key={topic}
                  className={selectedTopics.includes(topic) ? "checked" : ""}
                >
                  <Input
                    type="checkbox"
                    checked={selectedTopics.includes(topic)}
                    onChange={(e) =>
                      setSelectedTopics((current) =>
                        e.target.checked
                          ? [...current, topic]
                          : current.filter((t) => t !== topic),
                      )
                    }
                  />
                  {topic}
                  {selectedTopics.includes(topic) && <Check size={12} />}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Your notes
            <Textarea
              placeholder="Why did this catch your eye?"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="detail-footer">
            <Button
              type="button"
              className="icon-button danger"
              aria-label="Delete this save"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={17} />
            </Button>
            <Button className="button primary" disabled={busy}>
              Save changes <Check size={15} />
            </Button>
          </div>
          {confirmDelete && (
            <div className="delete-confirm">
              <p>Remove this save and its stored file?</p>
              <Button
                type="button"
                className="button secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Keep it
              </Button>
              <Button
                type="button"
                className="button primary"
                onClick={onDelete}
              >
                Remove save
              </Button>
            </div>
          )}
        </form>
      </div>
    </Modal>
  );
}

export function TopicModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  return (
    <Modal title="New collection" onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name);
        }}
      >
        <p>
          A collection brings related saves together, no matter where they came
          from.
        </p>
        <label>
          Collection name
          <Input
            placeholder="e.g. Things to make"
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <Button className="button primary" disabled={!name.trim()}>
          Create collection <Plus size={16} />
        </Button>
      </form>
    </Modal>
  );
}

export function SettingsModal({
  data,
  demo,
  onClose,
  onRename,
  onRemoveTopic,
  onRefresh,
}) {
  const api = useApi();
  const [exportError, setExportError] = useState("");
  const [editing, setEditing] = useState(null),
    [name, setName] = useState(""),
    [remove, setRemove] = useState(null);
  async function exportData() {
    let exported = data;
    if (api)
      try {
        exported = await api("/export");
      } catch (e) {
        setExportError(e.message);
        return;
      }
    const blob = new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), ...exported },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "remit-library.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="modal-body settings-body">
        <section>
          <h3>Your workspace</h3>
          <p>Manage your library and collections.</p>
          <Button className="button secondary" onClick={exportData}>
            <Download size={15} /> Export library
          </Button>
          {exportError && <p role="alert">{exportError}</p>}
          <small>
            Includes links, notes, and topics. Download attached originals from
            each item.
          </small>
        </section>
        <section>
          <h3>Your collections</h3>
          {data.topics.map((topic) => (
            <div className="settings-topic" key={topic}>
              {editing === topic ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onRename(topic, name);
                    setEditing(null);
                  }}
                >
                  <Input
                    aria-label={`Rename ${topic}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={50}
                    required
                  />
                  <Button
                    className="icon-button"
                    aria-label="Save collection name"
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    className="icon-button"
                    aria-label="Cancel rename"
                    onClick={() => setEditing(null)}
                  >
                    <X size={16} />
                  </Button>
                </form>
              ) : (
                <>
                  <span>
                    <Folder size={15} />
                    {topic}
                  </span>
                  <div>
                    <Button
                      className="icon-button"
                      aria-label={`Rename ${topic}`}
                      onClick={() => {
                        setEditing(topic);
                        setName(topic);
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      className="icon-button"
                      aria-label={`Remove collection ${topic}`}
                      onClick={() => setRemove(topic)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </>
              )}
              {remove === topic && (
                <div className="collection-confirm">
                  <p>
                    Remove this collection? Your saves will stay in the library.
                  </p>
                  <Button onClick={() => setRemove(null)}>Cancel</Button>
                  <Button
                    onClick={() => {
                      onRemoveTopic(topic);
                      setRemove(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>
        <PreferencesPanel onRefresh={onRefresh} />
        <section className="settings-about">
          <Logo small />

          <span>No audio or vision processing</span>
        </section>
      </div>
    </Modal>
  );
}
