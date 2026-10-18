import { useEffect, useState, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Home,
  Search,
  Plus,
  X,
  Check,
  Grid2X2,
  List,
  SlidersHorizontal,
  Heart,
  Link,
  FileText,
  Image as ImageIcon,
  Settings,
  LogOut,
  Menu,
  Sparkles,
  Pencil,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
const cx = (...values) => values.filter(Boolean).join(" ");
import { UserButton } from "@clerk/react";
import {
  sampleItems,
  initialTopics,
  filterItems,
  topicCounts,
  platformFor,
  validWebUrl,
} from "../lib/library";
import { fileStore } from "../lib/files";
import { Logo, Scribble, SourceIcon } from "./brand";
import { Composer } from "./composer";
import { SaveCard, Empty } from "./save-card";
import { ItemDetail, TopicModal, SettingsModal } from "./item-dialogs";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { useApi } from "../lib/api";
import { AskPanel } from "./backend-panels";
const keyFor = (id) => `remit-library-v1:${id}`;

export function Workspace({ userId, name, demo = false, route, navigate }) {
  const api = useApi();
  const [backendError, setBackendError] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const base = demo ? "/demo" : "";
  const page =
    route.slice(base.length).split("?")[0].replace("/", "") || "home";
  const [data, setData] = useState(() => {
    if (!demo) return { items: [], topics: [] };
    try {
      const saved = JSON.parse(localStorage.getItem(keyFor(userId)));
      if (saved && Array.isArray(saved.items) && Array.isArray(saved.topics))
        return {
          ...saved,
          items: saved.items.map((item) =>
            item.sample && item.title === "Less, but better."
              ? {
                  ...item,
                  title: "Notes on visual hierarchy",
                  description:
                    "Use spacing, scale, and contrast to establish a clear reading order.",
                }
              : item,
          ),
        };
    } catch {}
    return { items: demo ? sampleItems : [], topics: initialTopics };
  });
  const [query, setQuery] = useState(""),
    [topic, setTopic] = useState("All"),
    [platform, setPlatform] = useState("All"),
    [sort, setSort] = useState("newest"),
    [view, setView] = useState("grid"),
    [showFilters, setShowFilters] = useState(false),
    [searchMode, setSearchMode] = useState("search");
  const [selected, setSelected] = useState(null),
    [modal, setModal] = useState(null),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState(""),
    [messages, setMessages] = useState([]),
    [storageError, setStorageError] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => matchMedia("(max-width: 680px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 680px)");
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobile(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (modal) setMobile(false);
  }, [modal]);
  const notify = (message) => setToast(message);
  const refresh = useCallback(async () => {
    if (!api) return;
    const result = await api("/library");
    setData(result);
    setBackendError("");
  }, [api]);
  useEffect(() => {
    if (!api) return;
    let active = true;
    const load = async () => {
      try {
        const result = await api("/library");
        if (active) {
          setData(result);
          setBackendError("");
        }
      } catch (e) {
        if (active) setBackendError(e.message);
      }
    };
    load();
    const timer = setInterval(load, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  useEffect(() => {
    if (!api || !["library", "favorites"].includes(page)) return;
    const controller = new AbortController();
    setSearchResult(null);
    const timer = setTimeout(async () => {
      try {
        const result = await api("/search", {
          method: "POST",
          body: {
            query,
            topic: page === "library" ? topic : "All",
            platform,
            favorite: page === "favorites",
          },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setSearchResult(result);
      } catch (e) {
        if (!controller.signal.aborted) setBackendError(e.message);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, query, topic, platform, page, data.items]);
  useEffect(() => {
    if (!demo) return;
    try {
      localStorage.setItem(keyFor(userId), JSON.stringify(data));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [data, userId]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    function keyboard(e) {
      if (e.key === "Escape") setMobile(false);
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        navigate(base + "/library");
        setTimeout(
          () => document.getElementById("library-search")?.focus(),
          50,
        );
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [base, navigate]);
  const go = (next) => {
    navigate(base + "/" + next);
    setMobile(false);
  };
  const counts = topicCounts(data.items, data.topics);
  const selectedItem = data.items.find((i) => i.id === selected);
  const patchItem = async (id, patch) => {
    if (api) {
      await api(`/items/${id}`, { method: "PATCH", body: patch });
      await refresh();
      return;
    }
    setData((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
  };
  const browseTopic = (chosen) => {
    setTopic(chosen);
    setQuery("");
    setPlatform("All");
    go("library");
  };
  async function save({ text, files, chosenTopic }) {
    if (api) {
      const urls = [
        ...new Set(
          (text.match(/https?:\/\/[^\s]+/g) || []).map((u) =>
            u.replace(/[),.;]+$/, ""),
          ),
        ),
      ];
      const topics = chosenTopic ? [chosenTopic] : [];
      const results = [],
        failures = [];
      for (const url of urls) {
        try {
          results.push(
            await api("/items", {
              method: "POST",
              body: {
                url,
                notes: text.replace(/https?:\/\/[^\s]+/g, "").trim(),
                topics,
              },
            }),
          );
        } catch (e) {
          failures.push(e.message);
        }
      }
      if (text.trim() && !urls.length) {
        try {
          results.push(
            await api("/items", { method: "POST", body: { text, topics } }),
          );
        } catch (e) {
          failures.push(e.message);
        }
      }
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("topics", JSON.stringify(topics));
        try {
          results.push(await api("/uploads", { method: "POST", body: form }));
        } catch (e) {
          failures.push(`${file.name}: ${e.message}`);
        }
      }
      await refresh();
      if (results.length) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            text: text || files.map((f) => f.name).join(", "),
            reply: `Saved ${results.filter((r) => !r.duplicate).length} new items. ${results.filter((r) => r.duplicate).length} already saved. ${failures.join(" ")}`,
            ids: results.map((r) => r.item.id),
          },
        ]);
        notify("Saved to your library");
      }
      if (failures.length) throw new Error(failures.join(" "));
      return;
    }
    const newItems = [],
      responses = [];
    const now = new Date().toISOString();
    const matches = text.match(/https?:\/\/[^\s]+/g) || [];
    const urls = [
      ...new Set(
        matches
          .map((s) => validWebUrl(s.replace(/[),.;]+$/, "")))
          .filter(Boolean),
      ),
    ];
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text.trim()) && !urls.length)
      throw new Error("Please use an http or https web link.");
    const topics = chosenTopic ? [chosenTopic] : [];
    for (const url of urls) {
      if (data.items.some((i) => i.url === url)) {
        responses.push("That link is already in your library.");
        continue;
      }
      const host = new URL(url).hostname.replace(/^www\./, "");
      newItems.push({
        id: crypto.randomUUID(),
        title: host,
        url,
        platform: platformFor(url),
        kind: "link",
        topics,
        description:
          "Link saved.",
        notes: text.replace(/https?:\/\/[^\s]+/g, "").trim(),
        createdAt: now,
        favorite: false,
      });
    }
    if (text.trim() && !urls.length)
      newItems.push({
        id: crypto.randomUUID(),
        title: text.trim().split("\n")[0].slice(0, 90),
        description: text.trim(),
        platform: "Note",
        kind: "note",
        topics,
        createdAt: now,
        favorite: false,
      });
    for (const file of files) {
      const id = crypto.randomUUID();
      try {
        await fileStore("put", `${userId}:${id}`, file);
        newItems.push({
          id,
          title: file.name,
          platform: file.type === "application/pdf" ? "PDF" : "Image",
          kind: file.type === "application/pdf" ? "pdf" : "image",
          fileKey: `${userId}:${id}`,
          fileSize: file.size,
          topics,
          description:
            "File saved.",
          createdAt: now,
          favorite: false,
        });
      } catch {
        responses.push(
          `Could not store ${file.name}. Browser storage may be full.`,
        );
      }
    }
    if (newItems.length) {
      setData((d) => ({ ...d, items: [...newItems, ...d.items] }));
      responses.unshift(
        `Saved ${newItems.length === 1 ? "it" : `${newItems.length} items`}${chosenTopic ? ` to ${chosenTopic}` : " to your library"}.`,
      );
    }
    if (!responses.length) return;
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        text: text || files.map((f) => f.name).join(", "),
        reply: responses.join(" "),
        ids: newItems.map((i) => i.id),
      },
    ]);
    notify(newItems.length ? "Saved to your library" : responses[0]);
  }
  async function deleteItem(item) {
    if (api) {
      try {
        await api(`/items/${item.id}`, { method: "DELETE" });
        setSelected(null);
        await refresh();
        notify("Save removed");
      } catch (e) {
        notify(e.message);
      }
      return;
    }
    if (item.fileKey)
      try {
        await fileStore("delete", item.fileKey);
      } catch {
        notify("Could not remove the stored file. Please try again.");
        return;
      }
    setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id) }));
    setSelected(null);
    notify("Save removed");
  }
  async function addTopic(name) {
    if (api) {
      try {
        await api("/topics", { method: "POST", body: { name } });
        await refresh();
        notify("Collection created");
        return true;
      } catch (e) {
        notify(e.message);
        return false;
      }
    }
    const clean = name.trim();
    if (!clean) return false;
    if (data.topics.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      notify("That topic already exists");
      return false;
    }
    setData((d) => ({ ...d, topics: [...d.topics, clean] }));
    notify("Collection created");
    return true;
  }
  const localVisible = filterItems(data.items, {
    query,
    topic: page === "library" ? topic : "All",
    platform,
    sort,
    favorite: page === "favorites",
  });
  const visible =
    api && searchResult && ["library", "favorites"].includes(page)
      ? filterItems(
          data.items.filter((i) => searchResult.ids.includes(i.id)),
          { sort },
        )
      : localVisible;
  const pageTitle =
    {
      home: "Home",
      save: "Save something",
      library: "Your library",
      favorites: "Favorites",
    }[page] || "Your library";
  return (
    <div className="app-shell">
      {mobile && (
        <Button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={cx("sidebar", mobile && "open")}
        inert={isMobile && !mobile ? true : undefined}
      >
        <a
          href={`#${base}/home`}
          className="sidebar-logo"
          aria-label="Remit home"
        >
          <Logo />
        </a>

        <Button className="button primary new-save" onClick={() => go("save")}>
          <Plus size={17} /> Save something <span>↗</span>
        </Button>
        <nav className="main-nav" aria-label="Main navigation">
          {[
            [Home, "home", "Home"],
            [Search, "library", "Library & search"],
            [Heart, "favorites", "Favorites"],
          ].map(([Icon, id, label]) => (
            <Button
              key={id}
              className={cx("nav-item", page === id && "active")}
              onClick={() => {
                if (id === "library") {
                  setTopic("All");
                  setQuery("");
                }
                go(id);
              }}
            >
              <Icon size={18} strokeWidth={1.6} />
              <span>{label}</span>

              {id === "library" && <kbd>⌘ K</kbd>}
            </Button>
          ))}
        </nav>
        <div className="sidebar-section-label">
          <span>YOUR COLLECTIONS</span>
          <Button
            className="icon-button"
            aria-label="Create collection"
            onClick={() => setModal("topic")}
          >
            <Plus size={15} />
          </Button>
        </div>
        <nav className="collection-nav" aria-label="Collections">
          {counts.map(({ name, count }) => (
            <Button
              key={name}
              className={cx(
                "nav-item",
                page === "library" && topic === name && "selected-topic",
              )}
              onClick={() => browseTopic(name)}
            >
              <span className="topic-dot" />
              <span>{name}</span>
              <span className="topic-count">{count}</span>
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Button className="nav-item" onClick={() => setModal("settings")}>
            <Settings size={17} />
            <span>Settings</span>
          </Button>
          <div className="account-row">
            {demo ? <div className="avatar">c</div> : <UserButton />}
            <div>
              <strong>{demo ? "Curious explorer" : name}</strong>
              <small>Personal workspace</small>
            </div>
            {demo && (
              <Button
                className="icon-button"
                aria-label="Back to home"
                onClick={() => navigate("/")}
              >
                <LogOut size={16} />
              </Button>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <Button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </Button>
            <span className="breadcrumb">
              My workspace <span>/</span>{" "}
              <strong>
                {page === "home"
                  ? "Home"
                  : page === "save"
                    ? "Save something"
                    : page === "favorites"
                      ? "Favorites"
                      : "Library"}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="local-pill">
              <span />
              PERSONAL LIBRARY
            </span>
            <Button
              className="icon-button"
              aria-label="Open settings"
              onClick={() => setModal("settings")}
            >
              <Settings size={17} />
            </Button>
          </div>
        </header>
        {backendError && (
          <div className="storage-warning" role="alert">
            {backendError}{" "}
            <Button
              className="text-button"
              onClick={() => refresh().catch((e) => setBackendError(e.message))}
            >
              Retry connection
            </Button>
          </div>
        )}
        {storageError && (
          <div className="storage-warning" role="alert">
            Browser storage is full. Export your library in Settings before
            leaving this page.
          </div>
        )}
        <main className={cx("main-content", page === "save" && "chat-main")}>
          {page === "home" ? (
            <>
              <div className="welcome-row">
                <h1>Home</h1>
              </div>
              <Composer
                topics={data.topics}
                onSave={async (payload) => {
                  await save(payload);
                  go("save");
                }}
                compact
              />
              <section className="section-block">
                <div className="section-heading">
                  <h2>Top interests</h2>
                  <Button
                    className="text-button"
                    onClick={() => {
                      setTopic("All");
                      go("library");
                    }}
                  >
                    All collections <ArrowUpRight size={15} />
                  </Button>
                </div>
                <div className="interest-grid">
                  {counts.slice(0, 4).map(({ name, count }) => (
                    <Button
                      className="interest-card"
                      key={name}
                      onClick={() => browseTopic(name)}
                    >
                      <div className="interest-top">
                        <ArrowUpRight size={17} />
                      </div>
                      <h3>{name}</h3>
                      <span>
                        {count} {count === 1 ? "save" : "saves"}{" "}
                      </span>
                    </Button>
                  ))}
                </div>
              </section>
              <section className="section-block recent-section">
                <div className="section-heading">
                  <h2>
                    Recent saves{" "}
                    <span className="subtle-count">{data.items.length}</span>
                  </h2>
                  <Button
                    className="text-button"
                    onClick={() => {
                      setTopic("All");
                      setQuery("");
                      go("library");
                    }}
                  >
                    View library <ArrowRight size={15} />
                  </Button>
                </div>
                {data.items.length ? (
                  <div className="save-grid">
                    {data.items.slice(0, 3).map((item) => (
                      <SaveCard
                        key={item.id}
                        item={item}
                        onOpen={() => setSelected(item.id)}
                        onFavorite={() =>
                          patchItem(item.id, {
                            favorite: !item.favorite,
                          }).catch((e) => notify(e.message))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="No saves yet"
                    text="Add a link, PDF, image, or note to get started."
                    onAction={() => go("save")}
                    action="Save something"
                  />
                )}
              </section>
            </>
          ) : page === "save" ? (
            <>
              <div className="chat-heading">
                <h1>Save something</h1>
              </div>
              {messages.length === 0 ? (
                <div className="chat-welcome">
                  <div className="input-types">
                    <span>
                      <Link size={14} /> Links
                    </span>
                    <span>
                      <FileText size={14} /> PDFs
                    </span>
                    <span>
                      <ImageIcon size={14} /> Pictures
                    </span>
                    <span>
                      <Pencil size={14} /> Notes
                    </span>
                  </div>
                </div>
              ) : (
                <div className="messages" aria-live="polite">
                  {messages.map((message) => (
                    <div className="message-pair" key={message.id}>
                      <div className="user-message">{message.text}</div>
                      <div className="assistant-message">
                        <span className="mini-mark">r.</span>
                        <div>
                          <p>{message.reply}</p>
                          <div className="message-saves">
                            {message.ids.map((id) => {
                              const item = data.items.find((i) => i.id === id);
                              return (
                                item && (
                                  <Button
                                    key={id}
                                    onClick={() => setSelected(id)}
                                  >
                                    <SourceIcon platform={item.platform} />
                                    <span>{item.title}</span>
                                    <ArrowUpRight size={15} />
                                  </Button>
                                )
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="chat-composer">
                <Composer topics={data.topics} onSave={save} />
                <p className="composer-footnote">
                  {demo
                    ? "Saves stay in this browser."
                    : "Saved privately. Content is organized in the background."}
                </p>
              </div>
            </>
          ) : (
            <Tabs value={searchMode} onValueChange={setSearchMode}>
              <div className="library-heading">
                <div>
                  <h1>
                    {page === "library" && topic !== "All" ? (
                      <Scribble>{topic}</Scribble>
                    ) : (
                      <Scribble>{pageTitle}</Scribble>
                    )}
                    <span className="title-count">
                      {page === "favorites"
                        ? data.items.filter((i) => i.favorite).length
                        : topic === "All"
                          ? data.items.length
                          : data.items.filter((i) => i.topics.includes(topic))
                              .length}
                    </span>
                  </h1>
                </div>
                <Button className="button secondary" onClick={() => go("save")}>
                  <Plus size={16} /> Add a save
                </Button>
              </div>
              <div className="search-area">
                <div className="search-box">
                  <Search size={21} />
                  <Input
                    id="library-search"
                    aria-label="Search your library"
                    placeholder={
                      searchMode === "ask"
                        ? "What would you like to know about your saves?"
                        : "Find that thing you saved…"
                    }
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <Button
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X size={16} />
                    </Button>
                  )}
                  <kbd>⌘ K</kbd>
                </div>
                <div>
                  <TabsList aria-label="Search mode">
                    <TabsTrigger value="search">Search</TabsTrigger>
                    <TabsTrigger value="ask">
                      <Sparkles size={14} /> Ask
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>
              <TabsContent value={searchMode}>
                {searchMode === "ask" && (
                  <AskPanel
                    query={query}
                    topic={topic}
                    platform={platform}
                    favorite={page === "favorites"}
                    onOpen={setSelected}
                  />
                )}
                {page === "library" && (
                  <div className="topic-tabs">
                    <Button
                      className={topic === "All" ? "active" : ""}
                      onClick={() => setTopic("All")}
                    >
                      Everything <span>{data.items.length}</span>
                    </Button>
                    {counts.map(({ name, count }) => (
                      <Button
                        key={name}
                        className={topic === name ? "active" : ""}
                        onClick={() => setTopic(name)}
                      >
                        {name}
                        <span>{count}</span>
                      </Button>
                    ))}
                    <Button
                      className="add-topic-tab"
                      aria-label="Create topic"
                      onClick={() => setModal("topic")}
                    >
                      <Plus size={16} />
                    </Button>
                  </div>
                )}
                <div className="library-toolbar">
                  <span>
                    {visible.length} {visible.length === 1 ? "save" : "saves"}
                    {query && " found"}
                  </span>
                  <div>
                    <Button
                      className={cx("filter-button", showFilters && "active")}
                      onClick={() => setShowFilters(!showFilters)}
                      aria-expanded={showFilters}
                    >
                      <SlidersHorizontal size={14} /> Filters
                      {platform !== "All" && " · 1"}
                    </Button>
                    <select
                      aria-label="Sort saves"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="title">Title A–Z</option>
                    </select>
                    <div className="view-toggle">
                      <Button
                        aria-label="Grid view"
                        aria-pressed={view === "grid"}
                        className={view === "grid" ? "active" : ""}
                        onClick={() => setView("grid")}
                      >
                        <Grid2X2 size={16} />
                      </Button>
                      <Button
                        aria-label="List view"
                        aria-pressed={view === "list"}
                        className={view === "list" ? "active" : ""}
                        onClick={() => setView("list")}
                      >
                        <List size={17} />
                      </Button>
                    </div>
                  </div>
                </div>
                {showFilters && (
                  <div className="filter-panel">
                    <label>
                      Source
                      <select
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                      >
                        <option>All</option>
                        {[...new Set(data.items.map((i) => i.platform))]
                          .sort()
                          .map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                      </select>
                    </label>
                    <Button
                      className="text-button"
                      onClick={() => {
                        setPlatform("All");
                        setSort("newest");
                      }}
                    >
                      Reset filters
                    </Button>
                  </div>
                )}
                {visible.length ? (
                  <div className={view === "grid" ? "save-grid" : "save-list"}>
                    {visible.map((item) => (
                      <SaveCard
                        key={item.id}
                        item={item}
                        list={view === "list"}
                        onOpen={() => setSelected(item.id)}
                        onFavorite={() =>
                          patchItem(item.id, {
                            favorite: !item.favorite,
                          }).catch((e) => notify(e.message))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <Empty
                    title={query ? "No matching saves" : "No saves yet"}
                    text={
                      query
                        ? "Try another keyword or clear your filters."
                        : "Add a save to get started."
                    }
                    action={
                      query || platform !== "All"
                        ? "Clear search & filters"
                        : "Save something"
                    }
                    onAction={() => {
                      if (query || platform !== "All") {
                        setQuery("");
                        setPlatform("All");
                      } else go("save");
                    }}
                  />
                )}
              </TabsContent>
            </Tabs>
          )}
        </main>
      </div>
      {selectedItem && (
        <ItemDetail
          item={selectedItem}
          topics={data.topics}
          onClose={() => setSelected(null)}
          onRefresh={refresh}
          onSave={async (patch) => {
            await patchItem(selectedItem.id, patch);
            notify("Changes saved");
          }}
          onDelete={() => deleteItem(selectedItem)}
        />
      )}
      {modal === "topic" && (
        <TopicModal
          onClose={() => setModal(null)}
          onCreate={async (name) => {
            if (await addTopic(name)) {
              setModal(null);
              browseTopic(name);
            }
          }}
        />
      )}
      {modal === "settings" && (
        <SettingsModal
          data={data}
          demo={demo}
          onClose={() => setModal(null)}
          onRefresh={refresh}
          onRename={async (oldName, newName) => {
            if (api) {
              try {
                await api(`/topics/${encodeURIComponent(oldName)}`, {
                  method: "PATCH",
                  body: { name: newName },
                });
                await refresh();
                if (topic === oldName) setTopic(newName);
              } catch (e) {
                notify(e.message);
              }
              return;
            }
            const name = newName.trim();
            if (!name) return;
            if (
              data.topics.some(
                (t) => t !== oldName && t.toLowerCase() === name.toLowerCase(),
              )
            ) {
              notify("A collection with that name already exists");
              return;
            }
            setData((d) => ({
              ...d,
              topics: d.topics.map((t) => (t === oldName ? name : t)),
              items: d.items.map((i) => ({
                ...i,
                topics: i.topics.map((t) => (t === oldName ? name : t)),
              })),
            }));
            if (topic === oldName) setTopic(name);
            notify("Collection renamed");
          }}
          onRemoveTopic={async (name) => {
            if (api) {
              try {
                await api(`/topics/${encodeURIComponent(name)}`, {
                  method: "DELETE",
                });
                await refresh();
                if (topic === name) setTopic("All");
              } catch (e) {
                notify(e.message);
              }
              return;
            }
            setData((d) => ({
              ...d,
              topics: d.topics.filter((t) => t !== name),
              items: d.items.map((i) => ({
                ...i,
                topics: i.topics.filter((t) => t !== name),
              })),
            }));
            if (topic === name) setTopic("All");
            notify("Collection removed. Your saves are still in the library.");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <Button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </Button>
        </div>
      )}
    </div>
  );
}
