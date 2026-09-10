import { getValueByPath } from "../utils.ts";

export function executeConditionalCheck(step: any, contextData: any, steps: any[]): any {
  console.log('🔍 === EXECUTING CONDITIONAL CHECK STEP ===');
  const config = step.config_json || {};
  console.log('🔧 Conditional check config:', JSON.stringify(config, null, 2));

  console.log('🔍 === STEP INPUT DATA INSPECTION ===');
  console.log('🔍 Full contextData at start of conditional check:', JSON.stringify(contextData, null, 2));
  console.log('🔍 contextData keys:', Object.keys(contextData));
  console.log('🔍 contextData.orders:', contextData.orders);
  if (contextData.orders && Array.isArray(contextData.orders)) {
    console.log('🔍 contextData.orders.length:', contextData.orders.length);
    console.log('🔍 contextData.orders[0]:', JSON.stringify(contextData.orders[0], null, 2));
    if (contextData.orders[0]?.consignee) {
      console.log('🔍 contextData.orders[0].consignee:', JSON.stringify(contextData.orders[0].consignee, null, 2));
      console.log('🔍 contextData.orders[0].consignee.clientId:', contextData.orders[0].consignee.clientId);
    } else {
      console.log('⚠️ contextData.orders[0].consignee is undefined');
    }
  } else {
    console.log('⚠️ contextData.orders is not an array or is undefined');
  }

  const rawFieldPath = config.fieldPath || config.jsonPath || config.checkField || '';
  const fieldPath = rawFieldPath.replace(/^\{\{|\}\}$/g, '');
  const operator = config.operator || config.conditionType || 'exists';
  const expectedValue = config.expectedValue;
  const storeResultAs = config.storeResultAs || `condition_${step.step_order}_result`;

  console.log('🔍 === CONDITIONAL CHECK PARAMETERS ===');
  console.log('🔍 Checking field path:', fieldPath);
  console.log('🔍 Operator:', operator);
  console.log('🔍 Expected value:', expectedValue);

  console.log('🔍 === RETRIEVING ACTUAL VALUE ===');
  const actualValue = getValueByPath(contextData, fieldPath, true);
  console.log('✅ Actual value from context:', actualValue);
  console.log('📊 Actual value type:', typeof actualValue);
  console.log('📊 Actual value === null:', actualValue === null);
  console.log('📊 Actual value === undefined:', actualValue === undefined);
  console.log('📊 Actual value stringified:', JSON.stringify(actualValue));

  let conditionMet = false;
  switch (operator) {
    case 'exists':
      conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== '';
      console.log(`🔍 Condition (exists): ${conditionMet}`);
      break;
    case 'is_not_null':
    case 'isNotNull':
      conditionMet = actualValue !== null && actualValue !== undefined;
      console.log(`🔍 Condition (is_not_null): ${conditionMet}`);
      break;
    case 'is_null':
    case 'isNull':
      conditionMet = actualValue === null || actualValue === undefined;
      console.log(`🔍 Condition (is_null): ${conditionMet}`);
      break;
    case 'not_exists':
    case 'notExists':
      conditionMet = actualValue === null || actualValue === undefined || actualValue === '';
      console.log(`🔍 Condition (not_exists): ${conditionMet}`);
      break;
    case 'equals':
    case 'eq':
      conditionMet = String(actualValue) === String(expectedValue);
      console.log(`🔍 Condition (equals): "${actualValue}" === "${expectedValue}" = ${conditionMet}`);
      break;
    case 'not_equals':
    case 'notEquals':
    case 'ne':
      conditionMet = String(actualValue) !== String(expectedValue);
      console.log(`🔍 Condition (not_equals): "${actualValue}" !== "${expectedValue}" = ${conditionMet}`);
      break;
    case 'contains':
      conditionMet = String(actualValue).includes(String(expectedValue));
      console.log(`🔍 Condition (contains): "${actualValue}".includes("${expectedValue}") = ${conditionMet}`);
      break;
    case 'not_contains':
    case 'notContains':
      conditionMet = !String(actualValue).includes(String(expectedValue));
      console.log(`🔍 Condition (not_contains): !("${actualValue}".includes("${expectedValue}")) = ${conditionMet}`);
      break;
    case 'greater_than':
    case 'gt': {
      const gtActual = parseFloat(actualValue);
      const gtExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(gtActual) && !isNaN(gtExpected) && gtActual > gtExpected;
      console.log(`🔍 Condition (greater_than): ${gtActual} > ${gtExpected} = ${conditionMet}`);
      break;
    }
    case 'less_than':
    case 'lt': {
      const ltActual = parseFloat(actualValue);
      const ltExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(ltActual) && !isNaN(ltExpected) && ltActual < ltExpected;
      console.log(`🔍 Condition (less_than): ${ltActual} < ${ltExpected} = ${conditionMet}`);
      break;
    }
    case 'greater_than_or_equal':
    case 'gte': {
      const gteActual = parseFloat(actualValue);
      const gteExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(gteActual) && !isNaN(gteExpected) && gteActual >= gteExpected;
      console.log(`🔍 Condition (greater_than_or_equal): ${gteActual} >= ${gteExpected} = ${conditionMet}`);
      break;
    }
    case 'less_than_or_equal':
    case 'lte': {
      const lteActual = parseFloat(actualValue);
      const lteExpected = parseFloat(expectedValue);
      conditionMet = !isNaN(lteActual) && !isNaN(lteExpected) && lteActual <= lteExpected;
      console.log(`🔍 Condition (less_than_or_equal): ${lteActual} <= ${lteExpected} = ${conditionMet}`);
      break;
    }
    default:
      console.warn(`⚠️ Unknown operator: ${operator}, defaulting to 'exists'`);
      conditionMet = actualValue !== null && actualValue !== undefined && actualValue !== '';
  }

  contextData[storeResultAs] = conditionMet;
  console.log(`✅ Conditional check result stored as "${storeResultAs}": ${conditionMet}`);

  console.log('🔍 === ROUTING DECISION LOGIC ===');
  console.log('🔍 next_step_on_success_id:', step.next_step_on_success_id);
  console.log('🔍 next_step_on_failure_id:', step.next_step_on_failure_id);

  let nextStepOnSuccessName = 'Not configured';
  let nextStepOnSuccessOrder: number | null = null;
  let nextStepOnFailureName = 'Not configured';
  let nextStepOnFailureOrder: number | null = null;
  let selectedNextStepName = 'Sequential (next in order)';
  let selectedNextStepOrder: number | null = step.step_order + 1;

  if (step.next_step_on_success_id) {
    const successStep = steps.find((s: any) => s.id === step.next_step_on_success_id);
    if (successStep) {
      nextStepOnSuccessName = `${successStep.step_name} (Step ${successStep.step_order})`;
      nextStepOnSuccessOrder = successStep.step_order;
      console.log(`✅ Found success step: ${nextStepOnSuccessName}`);
    } else {
      console.log(`⚠️ Success step ID configured but step not found: ${step.next_step_on_success_id}`);
    }
  }
  if (step.next_step_on_failure_id) {
    const failureStep = steps.find((s: any) => s.id === step.next_step_on_failure_id);
    if (failureStep) {
      nextStepOnFailureName = `${failureStep.step_name} (Step ${failureStep.step_order})`;
      nextStepOnFailureOrder = failureStep.step_order;
      console.log(`✅ Found failure step: ${nextStepOnFailureName}`);
    } else {
      console.log(`⚠️ Failure step ID configured but step not found: ${step.next_step_on_failure_id}`);
    }
  }

  if (conditionMet) {
    if (step.next_step_on_success_id) {
      selectedNextStepName = nextStepOnSuccessName;
      selectedNextStepOrder = nextStepOnSuccessOrder;
    }
  } else {
    if (step.next_step_on_failure_id) {
      selectedNextStepName = nextStepOnFailureName;
      selectedNextStepOrder = nextStepOnFailureOrder;
    }
  }

  const routingDecision = conditionMet
    ? `✅ CONDITION MET (${operator} = TRUE) → Should route to: ${selectedNextStepName}`
    : `❌ CONDITION NOT MET (${operator} = FALSE) → Should route to: ${selectedNextStepName}`;
  console.log('🔍 === ROUTING DECISION ===');
  console.log(routingDecision);
  console.log('🔍 Next Step on Success:', nextStepOnSuccessName);
  console.log('🔍 Next Step on Failure:', nextStepOnFailureName);
  console.log('🔍 Selected Next Step:', selectedNextStepName);

  return {
    conditionMet,
    fieldPath,
    operator,
    actualValue,
    expectedValue,
    storeResultAs,
    nextStepOnSuccess: nextStepOnSuccessName,
    nextStepOnSuccessOrder,
    nextStepOnFailure: nextStepOnFailureName,
    nextStepOnFailureOrder,
    selectedNextStep: selectedNextStepName,
    selectedNextStepOrder,
    routingDecision
  };
}
