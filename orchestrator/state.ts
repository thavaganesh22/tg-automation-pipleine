import * as fs from "fs/promises";
import * as path from "path";

const STATE_DIR = "./pipeline-state";

export class PipelineStateManager {
  private runId: string;

  constructor() {
    this.runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  }

  async save(key: string, data: unknown): Promise<void> {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const filePath = path.join(STATE_DIR, `${key}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async load<T = unknown>(key: string): Promise<T> {
    const filePath = path.join(STATE_DIR, `${key}.json`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(
        `[STATE] Cannot load "${key}" — has the previous agent run successfully?\n` +
        `Expected file: ${filePath}`
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(path.join(STATE_DIR, `${key}.json`));
      return true;
    } catch {
      return false;
    }
  }

  getRunId(): string {
    return this.runId;
  }
}
