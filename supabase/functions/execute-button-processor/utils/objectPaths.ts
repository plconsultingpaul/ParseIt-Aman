export function getValueByPath(obj: any, path: string): any {
  try {
    let actualPath = path;
    if (path.startsWith('execute.')) {
      actualPath = path.substring('execute.'.length);
    }

    const parts = actualPath.split('.');
    let current = obj;

    for (const part of parts) {
      if (part.includes('[') && part.includes(']')) {
        const arrayName = part.substring(0, part.indexOf('['));
        const arrayIndex = parseInt(part.substring(part.indexOf('[') + 1, part.indexOf(']')));
        current = current[arrayName]?.[arrayIndex];
      } else if (!isNaN(Number(part))) {
        current = current?.[parseInt(part)];
      } else {
        current = current?.[part];
      }

      if (current === undefined || current === null) {
        return null;
      }
    }

    return current;
  } catch {
    return null;
  }
}

export function replaceVariables(template: string, contextData: any): string {
  if (!template || typeof template !== 'string') return template;

  const variableRegex = /\{\{([^}]+)\}\}/g;
  return template.replace(variableRegex, (match, path) => {
    let trimmedPath = path.trim();

    if (trimmedPath.includes('@loopIndex')) {
      const loopIdx = contextData?.forEach?._index;
      if (typeof loopIdx === 'number') {
        trimmedPath = trimmedPath.replace(/@loopIndex/g, String(loopIdx));
        console.log('[LOOP_INDEX_DEBUG] Rewrote path with @loopIndex -> ' + trimmedPath);
      }
    }

    let value = getValueByPath(contextData.execute, trimmedPath);
    if (value === null || value === undefined) {
      value = getValueByPath(contextData.response, trimmedPath);
    }
    if (value === null || value === undefined) {
      if (contextData.forEach) {
        value = contextData.forEach[trimmedPath] ?? getValueByPath(contextData.forEach, trimmedPath);
      }
    }
    if (value === null || value === undefined) {
      value = getValueByPath(contextData, trimmedPath);
    }

    if (value !== null && value !== undefined) {
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    }
    return match;
  });
}

export function setValueByPath(obj: any, path: string, value: any): void {
  const parts: Array<{ key: string; isArray: boolean; index?: number }> = [];
  const pathParts = path.split('.');

  for (const part of pathParts) {
    const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
    if (arrayMatch) {
      parts.push({ key: arrayMatch[1], isArray: true, index: parseInt(arrayMatch[2]) });
    } else {
      parts.push({ key: part, isArray: false });
    }
  }

  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];

    if (part.isArray) {
      if (!current[part.key]) {
        current[part.key] = [];
      }
      if (!current[part.key][part.index!]) {
        current[part.key][part.index!] = nextPart.isArray ? [] : {};
      }
      current = current[part.key][part.index!];
    } else {
      if (!current[part.key]) {
        current[part.key] = nextPart.isArray ? [] : {};
      }
      current = current[part.key];
    }
  }

  const lastPart = parts[parts.length - 1];
  if (lastPart.isArray) {
    if (!current[lastPart.key]) {
      current[lastPart.key] = [];
    }
    current[lastPart.key][lastPart.index!] = value;
  } else {
    current[lastPart.key] = value;
  }
}
