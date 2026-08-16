import { invoke, isTauri } from "@tauri-apps/api/core";

export async function openGovernedUrl(url: string): Promise<string> {
  if (!isTauri()) {
    throw new Error("Governed URL opening is available only in the desktop runtime.");
  }
  return invoke<string>("open_governed_url", { url });
}
