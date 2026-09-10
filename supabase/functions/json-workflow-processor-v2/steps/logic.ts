import { getValueByPath } from "../utils.ts";

export function executeConditionalCheck(node: any, contextData: any): any {
  console.log('=== EXECUTING CONDITIONAL CHECK ===');
  const config = node.config_json || {};

  const rawFieldPath = config.fieldPath || config.jsonPath || config.checkField || '';
  const fieldPath = rawFieldPath.replace(/^\{\{|\}\}$/g, '');
  const operator = config.operator || config.conditionType || 'exists';
  const expectedValue = config.expectedValue;
  const storeResultAs = config.storeResultAs || `condition_${node.id}_result`;

  console.log('Checking field path:', fieldPath);
  console.log('Operator:', operator);
  console.log('Expected value:', expectedValue);

  const actualValue = getValueByPath(contextData, fieldPath);
  console.log('Actual value from context:', actualValue);

  let conditionMet = false;
  switch (operator) {
    case 'exists':
      conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== '';
      break;
    case 'is_not_null':
    case 'isNotNull':
      conditionMet = actualValue !== null && actualValue !== undefined;
      break;
    case 'is_null':
    case 'isNull':
      conditionMet = actualValue === null || actualValue === undefined;
      break;
    case 'not_exists':
    case 'notExists':
      conditionMet = actualValue === null || actualValue === undefined || actualValue === '';
      break;
    case 'equals':
    case 'eq':
      conditionMet = String(actualValue) === String(expectedValue);
      break;
    case 'not_equals':
    case 'notEquals':
    case 'ne':
      conditionMet = String(actualValue) !== String(expectedValue);
      break;
    case 'contains':
      conditionMet = String(actualValue).includes(String(expectedValue));
      break;
    case 'not_contains':
    case 'notContains':
      conditionMet = !String(actualValue).includes(String(expectedValue));
      break;
    case 'greater_than':
    case 'gt': {
      const gtActual = parseFloat(actualValue);
      const gtExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(gtActual) && !isNaN(gtExpected) && gtActual > gtExpected;
      break;
    }
    case 'less_than':
    case 'lt': {
      const ltActual = parseFloat(actualValue);
      const ltExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(ltActual) && !isNaN(ltExpected) && ltActual < ltExpected;
      break;
    }
    case 'greater_than_or_equal':
    case 'gte': {
      const gteActual = parseFloat(actualValue);
      const gteExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(gteActual) && !isNaN(gteExpected) && gteActual >= gteExpected;
      break;
    }
    case 'less_than_or_equal':
    case 'lte': {
      const lteActual = parseFloat(actualValue);
      const lteExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(lteActual) && !isNaN(lteExpected) && lteActual <= lteExpected;
      break;
    }
    default:
      console.warn(`Unknown operator: ${operator}, defaulting to 'exists'`);
      conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== '';
  }

  contextData[storeResultAs] = conditionMet;
  console.log(`Conditional result stored as "${storeResultAs}": ${conditionMet}`);
  console.log(`Routing: will follow ${conditionMet ? 'success' : 'failure'} edge`);

  return {
    conditionMet,
    fieldPath,
    operator,
    actualValue,
    expectedValue,
    storeResultAs
  };
}
