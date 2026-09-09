import { getValueByPath } from "../utils.ts";

export function executeDataTransform(node: any, contextData: any): any {
  const config = node.config_json || {};
  const rules = config.transformations || [];
  if (!contextData.transform) contextData.transform = {};
  const results: Record<string, any> = {};

  for (const rule of rules) {
    const srcPath = rule.sourceVariable || rule.field_name || '';
    const fn = rule.function || rule.transformation || '';
    const outName = rule.outputVariable || srcPath;
    if (!fn) continue;
    if (fn !== 'concat' && !srcPath) continue;

    let srcValue = getValueByPath(contextData, srcPath);
    if (srcValue === null || srcValue === undefined) {
      srcValue = getValueByPath(contextData.extractedData, srcPath);
    }
    const raw = srcValue !== null && srcValue !== undefined ? String(srcValue) : '';
    let result = raw;

    switch (fn) {
      case 'trim': result = raw.trim(); break;
      case 'uppercase': result = raw.toUpperCase(); break;
      case 'lowercase': result = raw.toLowerCase(); break;
      case 'trim_uppercase': result = raw.trim().toUpperCase(); break;
      case 'trim_lowercase': result = raw.trim().toLowerCase(); break;
      case 'remove_spaces': result = raw.replace(/\s/g, ''); break;
      case 'remove_leading_zeros': result = raw.replace(/^0+/, '') || '0'; break;
      case 'pad_left_10': result = raw.padStart(10, '0'); break;
      case 'left': {
        const count = rule.leftCount || raw.length;
        result = raw.substring(0, count);
        break;
      }
      case 'remove_left': {
        const count = rule.removeLeftCount || 0;
        result = raw.substring(count);
        break;
      }
      case 'substring_0_10': result = raw.substring(0, 10); break;
      case 'substring_0_20': result = raw.substring(0, 20); break;
      case 'concat': {
        const fields = Array.isArray(rule.concatFields) ? rule.concatFields : [];
        const sepType = rule.separatorType || 'none';
        const sep = sepType === 'space' ? ' ' : sepType === 'custom' ? (rule.separatorValue || '') : '';
        const emptyMode = rule.emptyHandling || 'keep';
        const parts = fields.map((f: string) => {
          let v = getValueByPath(contextData, f);
          if (v === null || v === undefined) v = getValueByPath(contextData.extractedData, f);
          return v !== null && v !== undefined ? String(v) : '';
        });
        const finalParts = emptyMode === 'skip' ? parts.filter((p: string) => p !== '') : parts;
        result = finalParts.join(sep);
        break;
      }
      default: result = raw;
    }

    contextData.transform[outName] = result;
    results[outName] = result;
    console.log(`Transform: ${srcPath} -> ${fn} -> transform.${outName} = "${result}"`);
  }

  return { transformed: true, results };
}
