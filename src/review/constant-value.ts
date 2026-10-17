/** Primitive-only AST evaluation. Never executes code or reads object properties. */
import type { AstNode } from './scope-analysis.js';
export const UNKNOWN_CONSTANT = Symbol('unknown_constant');
export type ConstantValue = string | boolean | typeof UNKNOWN_CONSTANT;
export const CONSTANT_LIMITS = { depth: 64, string_length: 1024 } as const;

export function constantValue(raw: unknown, resolve: (node: AstNode) => ConstantValue,
  budget: (depth: number) => void, depth = 0): ConstantValue {
  budget(depth);
  if (depth > CONSTANT_LIMITS.depth || !raw || typeof raw !== 'object' || !('type' in raw)) return UNKNOWN_CONSTANT;
  const node = raw as AstNode;
  const evaluate = (value: unknown) => constantValue(value, resolve, budget, depth + 1);
  if (node.type === 'Literal') return typeof node.value === 'boolean' || (typeof node.value === 'string'
    && node.value.length <= CONSTANT_LIMITS.string_length) ? node.value : UNKNOWN_CONSTANT;
  if (node.type === 'Identifier') return resolve(node);
  if (node.type === 'UnaryExpression' && node.operator === '!') {
    const value = evaluate(node.argument);
    return typeof value === 'boolean' ? !value : UNKNOWN_CONSTANT;
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = evaluate(node.left), right = evaluate(node.right);
    return typeof left === 'string' && typeof right === 'string' && left.length + right.length <= CONSTANT_LIMITS.string_length
      ? left + right : UNKNOWN_CONSTANT;
  }
  if (node.type === 'BinaryExpression' && ['===', '!=='].includes(String(node.operator))) {
    const left = evaluate(node.left), right = evaluate(node.right);
    return left === UNKNOWN_CONSTANT || right === UNKNOWN_CONSTANT ? UNKNOWN_CONSTANT
      : node.operator === '===' ? left === right : left !== right;
  }
  if (node.type === 'LogicalExpression' && ['&&', '||'].includes(String(node.operator))) {
    const left = evaluate(node.left);
    if (typeof left !== 'boolean') return UNKNOWN_CONSTANT;
    if ((node.operator === '&&' && !left) || (node.operator === '||' && left)) return left;
    const right = evaluate(node.right);
    return typeof right === 'boolean' ? right : UNKNOWN_CONSTANT;
  }
  if (node.type === 'ConditionalExpression') {
    const test = evaluate(node.test);
    return typeof test === 'boolean' ? evaluate(test ? node.consequent : node.alternate) : UNKNOWN_CONSTANT;
  }
  return UNKNOWN_CONSTANT;
}
