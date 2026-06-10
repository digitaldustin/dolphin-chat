import type { Citation } from "./storage";

export interface SearchResult extends Citation {
  engine?: string;
}

export async function searxngSearch(
  baseUrl: string,
  query: string,
  count = 5
): Promise<SearchResult[]> {
  if (!baseUrl) throw new Error("SearXNG URL not configured (Settings)");
  const url = new URL(baseUrl.replace(/\/$/, "") + "/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("safesearch", "1");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SearXNG ${res.status}`);
  const data = await res.json();
  const results = (data.results ?? []) as Array<{
    title: string;
    url: string;
    content?: string;
    engine?: string;
  }>;
  return results.slice(0, count).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    engine: r.engine,
  }));
}

export function formatSearchContext(results: SearchResult[]): string {
  if (!results.length) return "No search results.";
  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet ?? ""}`.trim()
    )
    .join("\n\n");
}
