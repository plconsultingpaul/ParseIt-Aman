import { evaluateSingleCondition } from "../utils/logic.ts";

export async function executeConditionalCheck(step: any, contextData: any): Promise<any> {
  console.log('\uD83D\uDD0D Executing Conditional Check step:', step.step_name);
  const config = step.config_json || {};

  console.log(`[COND_CHECK_DEBUG] Full config_json:`, JSON.stringify(config));
  console.log(`[COND_CHECK_DEBUG] contextData.response:`, JSON.stringify(contextData.response));
  console.log(`[COND_CHECK_DEBUG] contextData.execute:`, JSON.stringify(contextData.execute));

  const rawFieldPath = config.fieldPath || config.jsonPath || config.checkField || '';
  const operator = config.operator || config.conditionType || 'exists';
  const expectedValue = config.expectedValue;
  const additionalConditions = config.additionalConditions || [];
  const logicalOperator = config.logicalOperator || 'AND';

  const primaryResult = evaluateSingleCondition(rawFieldPath, operator, expectedValue, contextData);
  console.log(`\uD83D\uDD0D Primary condition: ${rawFieldPath} ${operator} ${expectedValue} = ${primaryResult.conditionMet} (actual: ${primaryResult.actualValue})`);

  let conditionMet = primaryResult.conditionMet;

  if (additionalConditions.length > 0) {
    console.log(`\uD83D\uDD17 Evaluating ${additionalConditions.length} additional condition(s) with ${logicalOperator} logic`);

    const allResults: boolean[] = [primaryResult.conditionMet];

    for (let i = 0; i < additionalConditions.length; i++) {
      const cond = additionalConditions[i];
      if (!cond.jsonPath) continue;

      const result = evaluateSingleCondition(
        cond.jsonPath,
        cond.operator || 'equals',
        cond.expectedValue,
        contextData
      );
      console.log(`\uD83D\uDD0D Additional condition ${i + 1}: ${cond.jsonPath} ${cond.operator} ${cond.expectedValue} = ${result.conditionMet} (actual: ${result.actualValue})`);
      allResults.push(result.conditionMet);
    }

    if (logicalOperator === 'AND') {
      conditionMet = allResults.every(r => r === true);
      console.log(`\u2705 AND result: ${conditionMet} (all ${allResults.length} conditions must be true)`);
    } else {
      conditionMet = allResults.some(r => r === true);
      console.log(`\u2705 OR result: ${conditionMet} (at least one of ${allResults.length} conditions must be true)`);
    }
  }

  const storeResultAs = config.storeResultAs || `condition_${step.step_order}_result`;
  contextData[storeResultAs] = conditionMet;

  return {
    conditionMet,
    fieldPath: rawFieldPath,
    operator,
    actualValue: primaryResult.actualValue,
    expectedValue,
    additionalConditions: additionalConditions.length,
    logicalOperator: additionalConditions.length > 0 ? logicalOperator : undefined
  };
}
