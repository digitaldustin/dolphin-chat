import { get, set, del, keys } from "idb-keyval";

export type ChatRole = "user" | "assistant" | "system";
export type ChatMode = "chat" | "research";

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
}

export interface Message {
  id: string;
  role: ChatRole;
  content: string;
  mode?: ChatMode;
  citations?: Citation[];
  thinking?: string;
  attachments?: Attachment[];
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

export interface ResearchReport {
  id: string;
  title: string;
  query: string;
  content: string;
  citations: Citation[];
  model: string;
  createdAt: number;
}

export interface LibraryFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string; // text content
  createdAt: number;
}

export interface Settings {
  ollamaBaseUrl: string;
  ollamaModel: string;
  searxngUrl: string;
  opencodeEnabled: boolean;
  webSearchResults: number;
  researchDepth: number;
  systemPrompt: string;
  theme: "slate" | "mocha" | "forest" | "plum";
  appearance: "light" | "dark" | "system";
}

const DEFAULTS: Settings = {
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3.2:latest",
  searxngUrl: "http://localhost:8888",
  opencodeEnabled: false,
  webSearchResults: 5,
  researchDepth: 3,
  systemPrompt:
    "You are a helpful, knowledgeable assistant. Use markdown for formatting. Cite sources when given.",
  theme: "slate",
  appearance: "dark",
};

const SETTINGS_KEY = "dolphin.settings.v1";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("settings:changed", { detail: s }));
}

// ---- Chats ----
const CHAT_PREFIX = "chat:";
const REPORT_PREFIX = "report:";
const FILE_PREFIX = "file:";

export const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function saveChat(chat: Chat) {
  await set(CHAT_PREFIX + chat.id, chat);
}
export async function getChat(id: string): Promise<Chat | undefined> {
  return get(CHAT_PREFIX + id);
}
export async function deleteChat(id: string) {
  await del(CHAT_PREFIX + id);
}
export async function listChats(): Promise<Chat[]> {
  const ks = await keys();
  const chatKeys = ks.filter(
    (k) => typeof k === "string" && k.startsWith(CHAT_PREFIX)
  );
  const chats = await Promise.all(chatKeys.map((k) => get(k as string)));
  return (chats.filter(Boolean) as Chat[]).sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
}

export async function saveReport(r: ResearchReport) {
  await set(REPORT_PREFIX + r.id, r);
}
export async function listReports(): Promise<ResearchReport[]> {
  const ks = await keys();
  const rk = ks.filter(
    (k) => typeof k === "string" && k.startsWith(REPORT_PREFIX)
  );
  const rs = await Promise.all(rk.map((k) => get(k as string)));
  return (rs.filter(Boolean) as ResearchReport[]).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}
export async function deleteReport(id: string) {
  await del(REPORT_PREFIX + id);
}

export async function saveFile(f: LibraryFile) {
  await set(FILE_PREFIX + f.id, f);
}
export async function listFiles(): Promise<LibraryFile[]> {
  const ks = await keys();
  const fk = ks.filter(
    (k) => typeof k === "string" && k.startsWith(FILE_PREFIX)
  );
  const fs = await Promise.all(fk.map((k) => get(k as string)));
  return (fs.filter(Boolean) as LibraryFile[]).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}
export async function deleteFile(id: string) {
  await del(FILE_PREFIX + id);
}
export async function getFile(id: string): Promise<LibraryFile | undefined> {
  return get(FILE_PREFIX + id);
}
