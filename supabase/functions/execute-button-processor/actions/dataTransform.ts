import { getValueByPath, setValueByPath } from "../utils/objectPaths.ts";

export function executeDataTransform(step: any, contextData: any): any {
  const dtConfig = step.config_json || {};
  const dtRules = dtConfig.transformations || [];
  if (!contextData.transform) contextData.transform = {};
  const dtResults: Record<string, any> = {};
  for (const rule of dtRules) {
    const srcPath = rule.sourceVariable || rule.field_name || '';
    const fn = rule.function || rule.transformation || '';
    const outName = rule.outputVariable || srcPath;
    if (!srcPath || !fn) continue;

    let srcValue = getValueByPath(contextData, srcPath);
    if (srcValue === null || srcValue === undefined) {
      srcValue = getValueByPath(contextData.execute, srcPath);
    }
    if (srcValue === null || srcValue === undefined) {
      srcValue = getValueByPath(contextData.response, srcPath);
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
      case 'multiply': {
        const factor = parseFloat(rule.mathFactor) || 0;
        const decimals = typeof rule.mathDecimals === 'number' ? rule.mathDecimals : 2;
        const num = parseFloat(raw) || 0;
        result = (num * factor).toFixed(decimals);
        break;
      }
      case 'divide': {
        const divisor = parseFloat(rule.mathFactor) || 1;
        const decimals = typeof rule.mathDecimals === 'number' ? rule.mathDecimals : 2;
        const num = parseFloat(raw) || 0;
        result = (num / divisor).toFixed(decimals);
        break;
      }
      case 'round': {
        const decimals = typeof rule.mathDecimals === 'number' ? rule.mathDecimals : 0;
        const num = parseFloat(raw) || 0;
        result = num.toFixed(decimals);
        break;
      }
      default: result = raw;
    }
    contextData.transform[outName] = result;
    dtResults[outName] = result;

    if (rule.overwriteSource && srcPath) {
      const writePath = srcPath.startsWith('execute.') ? srcPath.substring('execute.'.length) : srcPath;
      if (contextData.execute) {
        setValueByPath(contextData.execute, writePath, result);
      }
      console.log(`\uD83D\uDD27 Transform: ${srcPath} -> ${fn} -> overwrite execute.${writePath} = "${result}"`);
    } else {
      console.log(`\uD83D\uDD27 Transform: ${srcPath} -> ${fn} -> transform.${outName} = "${result}"`);
    }
  }
  return { transformed: true, results: dtResults };
}
