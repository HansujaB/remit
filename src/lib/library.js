export const initialTopics = [
  "System design",
  "Rangoli",
  "Design",
  "Good reads",
];
export const sampleItems = [
  {
    id: "s1",
    title: "A little guide to distributed systems",
    platform: "Article",
    topics: ["System design"],
    kind: "link",
    art: "systems",
    description:
      "An illustrative bookmark about how independent services work together. Try adding your own notes or changing its topic.",
    url: "https://en.wikipedia.org/wiki/Distributed_computing",
    createdAt: "2026-10-16T10:00:00Z",
    favorite: true,
    sample: true,
  },
  {
    id: "s2",
    title: "Little patterns, endless possibilities",
    platform: "Pinterest",
    topics: ["Rangoli"],
    kind: "link",
    art: "rangoli",
    description:
      "A sample visual inspiration card for your Rangoli collection. Artwork is illustrative, not an extracted pin.",
    url: "https://www.pinterest.com/search/pins/?q=rangoli",
    createdAt: "2026-10-16T09:00:00Z",
    favorite: false,
    sample: true,
  },
  {
    id: "s3",
    title: "Notes on visual hierarchy",
    platform: "Note",
    topics: ["Design"],
    kind: "note",
    art: "quote",
    description:
      "Use spacing, scale, and contrast to establish a clear reading order.",
    createdAt: "2026-10-15T10:00:00Z",
    favorite: true,
    sample: true,
  },
  {
    id: "s4",
    title: "The beauty of a simple cache",
    platform: "X",
    topics: ["System design"],
    kind: "link",
    art: "cache",
    description:
      "Sample bookmark: caching, invalidation, and the small decisions that make a system feel fast. No post has been scraped.",
    url: "https://x.com",
    createdAt: "2026-10-14T10:00:00Z",
    favorite: false,
    sample: true,
  },
  {
    id: "s5",
    title: "A slower way to learn something new",
    platform: "Article",
    topics: ["Good reads"],
    kind: "link",
    art: "book",
    description:
      "A sample reading bookmark about following your curiosity and taking useful notes.",
    url: "https://en.wikipedia.org/wiki/Spaced_repetition",
    createdAt: "2026-10-13T10:00:00Z",
    favorite: false,
    sample: true,
  },
  {
    id: "s6",
    title: "Rangoli, one dot at a time",
    platform: "Instagram",
    topics: ["Rangoli"],
    kind: "link",
    art: "dots",
    description:
      "An illustrative reel bookmark. Real Instagram captions and thumbnails will be supplied by the Apify integration.",
    url: "https://www.instagram.com",
    createdAt: "2026-10-12T10:00:00Z",
    favorite: false,
    sample: true,
  },
];
export function platformFor(url) {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  const is = (domain) => host === domain || host.endsWith("." + domain);
  if (is("instagram.com")) return "Instagram";
  if (is("pinterest.com") || is("pin.it")) return "Pinterest";
  if (is("x.com") || is("twitter.com")) return "X";
  if (is("youtube.com") || is("youtu.be")) return "YouTube";
  return "Website";
}
export function validWebUrl(text) {
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function filterItems(
  items,
  {
    query = "",
    topic = "All",
    platform = "All",
    favorite = false,
    sort = "newest",
  } = {},
) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return items
    .filter(
      (item) =>
        (topic === "All" || item.topics.includes(topic)) &&
        (platform === "All" || item.platform === platform) &&
        (!favorite || item.favorite) &&
        words.every((word) =>
          [
            item.title,
            item.url,
            item.description,
            item.notes,
            item.platform,
            ...item.topics,
          ]
            .join(" ")
            .toLowerCase()
            .includes(word),
        ),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "oldest"
          ? new Date(a.createdAt) - new Date(b.createdAt)
          : new Date(b.createdAt) - new Date(a.createdAt),
    );
}
export function topicCounts(items, topics) {
  return topics
    .map((name) => ({
      name,
      count: items.filter((item) => item.topics.includes(name)).length,
    }))
    .sort((a, b) => b.count - a.count);
}
