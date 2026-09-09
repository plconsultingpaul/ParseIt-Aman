import { getValueByPath } from "../utils/objectPaths.ts";
import { evaluateSingleCondition } from "../utils/logic.ts";

export function executeRoute(step: any, contextData: any): { stepOutput: any; matchedRouteIndex: number; handleId: string | null } {
  const routeConfig = step.config_json || {};
  const routeFieldPath = routeConfig.routeFieldPath || '';
  const routeOptions: Array<{ label: string; operator: string; expectedValue: string }> = routeConfig.routes || [];
  const routeDefaultIdx: number | null = routeConfig.routeDefaultIndex ?? null;

  const cleanPath = routeFieldPath.replace(/^\{\{|\}\}$/g, '');
  let fieldValue = getValueByPath(contextData.execute, cleanPath);
  if (fieldValue === null || fieldValue === undefined) {
    fieldValue = getValueByPath(contextData, cleanPath);
  }
  console.log(`\uD83D\uDEE4\uFE0F Route field "${cleanPath}" = "${fieldValue}"`);

  let matchedRouteIndex = -1;
  for (let ri = 0; ri < routeOptions.length; ri++) {
    const result = evaluateSingleCondition(routeFieldPath, routeOptions[ri].operator, routeOptions[ri].expectedValue, contextData);
    console.log(`\uD83D\uDEE4\uFE0F Route ${ri} "${routeOptions[ri].label}": ${routeOptions[ri].operator} "${routeOptions[ri].expectedValue}" => ${result.conditionMet}`);
    if (result.conditionMet) {
      matchedRouteIndex = ri;
      break;
    }
  }

  if (matchedRouteIndex === -1 && routeDefaultIdx !== null && routeDefaultIdx >= 0 && routeDefaultIdx < routeOptions.length) {
    matchedRouteIndex = routeDefaultIdx;
    console.log(`\uD83D\uDEE4\uFE0F No match found, using default route ${matchedRouteIndex}: "${routeOptions[matchedRouteIndex]?.label}"`);
  }

  const stepOutput = {
    routeField: cleanPath,
    fieldValue,
    matchedRoute: matchedRouteIndex >= 0 ? routeOptions[matchedRouteIndex]?.label : null,
    matchedRouteIndex,
  };

  const handleId = matchedRouteIndex >= 0 ? `route_${matchedRouteIndex}` : null;

  return { stepOutput, matchedRouteIndex, handleId };
}
