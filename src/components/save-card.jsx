import { itemPreview } from "../lib/content-preview";
import { useEffect, useState } from "react";
import { ArrowRight, Bookmark } from "lucide-react";
import { Button } from "./ui/button";

const cx = (...values) => values.filter(Boolean).join(" ");
import { useApi } from "../lib/api";
import { fileStore } from "../lib/files";
import { SourceIcon } from "./brand";

export function useFileUrl(fileKey) {
  const api = useApi();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!fileKey) return;
    let disposed = false,
      objectUrl;
    setUrl(null);
    (fileKey.startsWith("remote:")
      ? api(`/items/${fileKey.slice(7)}/file`, { blob: true })
      : fileStore("get", fileKey)
    )
      .then((file) => {
        if (file && !disposed) {
          objectUrl = URL.createObjectURL(file);
          setUrl(objectUrl);
        }
      })
      .catch(() => {});
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileKey, api]);
  return url;
}

export function SaveCard({ item, onOpen, onFavorite, list = false }) {
  const fileUrl = useFileUrl(item.kind === "image" ? item.fileKey : null);
  return (
    <article className={cx("save-card", list && "list-card")}>
      <Button className="card-main" onClick={onOpen}>
        {fileUrl && (
          <div className="card-visual">
            <img src={fileUrl} alt={item.title} />
          </div>
        )}
        <div className="card-body">
          <span className="card-source">
            <SourceIcon platform={item.platform} />
            {item.platform}
            {item.sample && " · Sample"}
          </span>
          <h3>{item.title}</h3>
          {itemPreview(item) && <p className="card-excerpt">{itemPreview(item)}</p>}
          <div className="card-meta">
            <span className="tag">{item.topics[0] || "Untagged"}</span>
            {item.topics.length > 1 && (
              <span className="more-tags">+{item.topics.length - 1}</span>
            )}
            <span className="card-date">
              {new Date(item.createdAt).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </Button>
      <Button
        className={cx("favorite-button", item.favorite && "is-favorite")}
        aria-label={`${item.favorite ? "Remove" : "Add"} ${item.title} ${item.favorite ? "from" : "to"} favorites`}
        aria-pressed={item.favorite}
        onClick={onFavorite}
      >
        <Bookmark size={16} fill={item.favorite ? "currentColor" : "none"} />
      </Button>
    </article>
  );
}

export function Empty({ title, text, action, onAction }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{text}</p>
      <Button className="button secondary" onClick={onAction}>
        {action}
        <ArrowRight size={15} />
      </Button>
    </div>
  );
}
