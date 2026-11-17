import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../shared/defaults';
import { settingsSchema } from '../shared/schemas';
import type { Settings } from '../shared/types';

export class SettingsStore {
  private current: Settings;
  private file: string;

  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    this.current = this.withDefaults({});
  }

  private withDefaults(partial: Partial<Settings>): Settings {
    const merged: Settings = {
      ...DEFAULT_SETTINGS,
      ...partial,
      shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(partial.shortcuts ?? {}) },
      stamp: { ...DEFAULT_SETTINGS.stamp, ...(partial.stamp ?? {}), fields: { ...DEFAULT_SETTINGS.stamp.fields, ...(partial.stamp?.fields ?? {}) } }
    };
    if (!merged.saveDirectory) merged.saveDirectory = path.join(app.getPath('documents'), 'AuditFrame Evidence');
    return merged;
  }

  async load(): Promise<Settings> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
      const candidate = this.withDefaults(raw);
      const parsed = settingsSchema.safeParse(candidate);
      this.current = parsed.success ? (parsed.data as Settings) : this.withDefaults({});
    } catch {
      this.current = this.withDefaults({});
    }
    return this.current;
  }

  get(): Settings {
    return this.current;
  }

  async set(next: Settings): Promise<Settings> {
    const parsed = settingsSchema.parse(next) as Settings;
    // Time display options live in settings and are mirrored into the stamp so the sidecar records what was rendered.
    parsed.stamp = { ...parsed.stamp, timeFormat: parsed.timeFormat, timeZone: parsed.timeZone };
    if (!parsed.saveDirectory) parsed.saveDirectory = this.current.saveDirectory;
    this.current = parsed;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(parsed, null, 2));
    return parsed;
  }
}
