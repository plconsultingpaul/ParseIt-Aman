export function scanPlaceholders(config: any): string[] {
  if (!config) return [];
  const found = new Set<string>();
  const walk = (v: any) => {
    if (v == null) return;
    if (typeof v === 'string') {
      const re = /\{\{\s*([a-zA-Z0-9_.\[\]-]+)\s*\}\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(v)) !== null) {
        const raw = (m[1] || '').trim();
        if (raw) found.add(raw);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (typeof v === 'object') {
      for (const key of Object.keys(v)) walk(v[key]);
    }
  };
  walk(config);
  return Array.from(found).sort();
}

export function getValueByPath(obj: any, path: string): any {
  try {
    if (obj == null || !path) return undefined;
    if (path in obj && typeof obj[path] !== 'object') return obj[path];
    const parts = path.split(/[.\[\]]/).filter(Boolean);
    let current: any = obj;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  } catch {
    return undefined;
  }
}
