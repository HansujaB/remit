import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleItems,
  filterItems,
  platformFor,
  validWebUrl,
  topicCounts,
} from "./library.js";

test("topic search brings together Pinterest and Instagram saves", () => {
  assert.deepEqual(
    new Set(
      filterItems(sampleItems, { query: "RANGOLI" }).map((i) => i.platform),
    ),
    new Set(["Pinterest", "Instagram"]),
  );
});
test("topic and platform filters intersect without excluding manual notes", () => {
  const items = [
    ...sampleItems,
    {
      id: "manual",
      title: "Practice",
      platform: "Note",
      topics: ["Rangoli"],
      description: "",
      createdAt: "2026-10-17",
    },
  ];
  assert.equal(filterItems(items, { topic: "Rangoli" }).length, 3);
  assert.deepEqual(
    filterItems(items, { topic: "Rangoli", platform: "Note" }).map((i) => i.id),
    ["manual"],
  );
});
test("search includes notes and URLs, and no-match queries stay empty", () => {
  const items = [
    {
      id: "link",
      title: "Example",
      url: "https://example.com/caching",
      notes: "a useful architecture guide",
      topics: [],
      createdAt: "2026-10-17",
    },
  ];
  assert.equal(filterItems(items, { query: "caching architecture" }).length, 1);
  assert.equal(filterItems(items, { query: "missing" }).length, 0);
});
test("untagged saves remain in the library and favorites stay filtered", () => {
  const items = [
    ...sampleItems,
    { id: "untagged", title: "New", topics: [], createdAt: "2026-10-17" },
  ];
  assert.deepEqual(
    filterItems(items).some((i) => i.id === "untagged"),
    true,
  );
  assert.equal(filterItems(items, { favorite: true }).length, 2);
});
test("source detection checks domain boundaries", () => {
  assert.equal(platformFor("https://www.instagram.com/reel/abc"), "Instagram");
  assert.equal(platformFor("https://pin.it/abc"), "Pinterest");
  assert.equal(platformFor("https://youtu.be/abc"), "YouTube");
  assert.equal(
    platformFor("https://instagram.com.evil.example/test"),
    "Website",
  );
});
test("only HTTP and HTTPS links are accepted", () => {
  assert.equal(validWebUrl("javascript:alert(1)"), null);
  assert.equal(validWebUrl("file:///private.pdf"), null);
  assert.equal(validWebUrl("https://example.com"), "https://example.com/");
});
test("interests reflect save counts and retain empty collections", () => {
  const result = topicCounts(sampleItems, ["Rangoli", "Empty"]);
  assert.deepEqual(result, [
    { name: "Rangoli", count: 2 },
    { name: "Empty", count: 0 },
  ]);
});
