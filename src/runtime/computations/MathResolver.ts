interface Variable {
  id: string;
  value?: number;
}

type ExpressionType = 'number' | 'variable' | 'operation';

interface ExpressionNode {
  type: ExpressionType;
  value?: number;
  variable?: Variable;
  operation?: string;
  left?: ExpressionNode;
  right?: ExpressionNode;
}

interface LinearTerm {
  coefficient: number;
  power: number;
  constant: number;
}

export class Expression {
  private node: ExpressionNode;

  constructor(node: ExpressionNode) {
    this.node = node;
  }

  static number(value: number): Expression {
    return new Expression({ type: 'number', value });
  }

  static variable(id: string): Expression {
    return new Expression({ type: 'variable', variable: { id } });
  }

  add(other: Expression | number): Expression {
    const rightNode = typeof other === 'number' 
      ? { type: 'number' as ExpressionType, value: other }
      : other.node;
    
    return new Expression({
      type: 'operation',
      operation: '+',
      left: this.node,
      right: rightNode
    });
  }

  subtract(other: Expression | number): Expression {
    const rightNode = typeof other === 'number' 
      ? { type: 'number' as ExpressionType, value: other }
      : other.node;
    
    return new Expression({
      type: 'operation',
      operation: '-',
      left: this.node,
      right: rightNode
    });
  }

  multiply(other: Expression | number): Expression {
    const rightNode = typeof other === 'number' 
      ? { type: 'number' as ExpressionType, value: other }
      : other.node;
    
    return new Expression({
      type: 'operation',
      operation: '*',
      left: this.node,
      right: rightNode
    });
  }

  divide(other: Expression | number): Expression {
    const rightNode = typeof other === 'number' 
      ? { type: 'number' as ExpressionType, value: other }
      : other.node;
    
    return new Expression({
      type: 'operation',
      operation: '/',
      left: this.node,
      right: rightNode
    });
  }

  power(other: Expression | number): Expression {
    const rightNode = typeof other === 'number' 
      ? { type: 'number' as ExpressionType, value: other }
      : other.node;
    
    return new Expression({
      type: 'operation',
      operation: '^',
      left: this.node,
      right: rightNode
    });
  }

  sqrt(): Expression {
    return new Expression({
      type: 'operation',
      operation: 'sqrt',
      left: this.node
    });
  }

  evaluate(variables: Record<string, number> = {}): number {
    return this.evaluateNode(this.node, variables);
  }

  private evaluateNode(node: ExpressionNode, variables: Record<string, number>): number {
    switch (node.type) {
      case 'number':
        return node.value!;
      
      case 'variable':
        const varId = node.variable!.id;
        if (!(varId in variables)) {
          throw new Error(`Variable ${varId} not found`);
        }
        return variables[varId];
      
      case 'operation':
        const left = node.left ? this.evaluateNode(node.left, variables) : 0;
        const right = node.right ? this.evaluateNode(node.right, variables) : 0;
        
        switch (node.operation) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': 
            if (right === 0) throw new Error('Division by zero');
            return left / right;
          case '^': return Math.pow(left, right);
          case 'sqrt': return Math.sqrt(left);
          default: throw new Error(`Unknown operation: ${node.operation}`);
        }
      
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  gt(other: Expression | number): Inequality {
    return new Inequality(this, '>', other);
  }

  lt(other: Expression | number): Inequality {
    return new Inequality(this, '<', other);
  }

  eq(other: Expression | number): Equation {
    return new Equation(this, other);
  }

  getVariables(): string[] {
    const variables = new Set<string>();
    this.collectVariables(this.node, variables);
    return Array.from(variables);
  }

  private collectVariables(node: ExpressionNode, variables: Set<string>): void {
    if (node.type === 'variable') {
      variables.add(node.variable!.id);
    } else if (node.type === 'operation') {
      if (node.left) this.collectVariables(node.left, variables);
      if (node.right) this.collectVariables(node.right, variables);
    }
  }

  clone(): Expression {
    return new Expression(this.cloneNode(this.node));
  }

  private cloneNode(node: ExpressionNode): ExpressionNode {
    const cloned: ExpressionNode = { type: node.type };
    
    if (node.value !== undefined) cloned.value = node.value;
    if (node.variable) cloned.variable = { ...node.variable };
    if (node.operation) cloned.operation = node.operation;
    if (node.left) cloned.left = this.cloneNode(node.left);
    if (node.right) cloned.right = this.cloneNode(node.right);
    
    return cloned;
  }

  getLinearForm(variable: string): LinearTerm {
    return this.extractLinearForm(this.node, variable);
  }

  private extractLinearForm(node: ExpressionNode, variable: string): LinearTerm {
    switch (node.type) {
      case 'number':
        return { coefficient: 0, power: 0, constant: node.value! };
      
      case 'variable':
        if (node.variable!.id === variable) {
          return { coefficient: 1, power: 1, constant: 0 };
        } else {
          return { coefficient: 0, power: 0, constant: 0 };
        }
      
      case 'operation':
        const left = node.left ? this.extractLinearForm(node.left, variable) : { coefficient: 0, power: 0, constant: 0 };
        const right = node.right ? this.extractLinearForm(node.right, variable) : { coefficient: 0, power: 0, constant: 0 };
        
        switch (node.operation) {
          case '+':
            return {
              coefficient: left.coefficient + right.coefficient,
              power: Math.max(left.power, right.power),
              constant: left.constant + right.constant
            };
          
          case '-':
            return {
              coefficient: left.coefficient - right.coefficient,
              power: Math.max(left.power, right.power),
              constant: left.constant - right.constant
            };
          
          case '*':
            if (left.coefficient === 0) {
              return {
                coefficient: left.constant * right.coefficient,
                power: right.power,
                constant: left.constant * right.constant
              };
            } else if (right.coefficient === 0) {
              return {
                coefficient: right.constant * left.coefficient,
                power: left.power,
                constant: left.constant * right.constant
              };
            } else {
              throw new Error('Cannot solve equations with variable multiplication');
            }
          
          case '/':
            if (right.coefficient === 0 && right.constant !== 0) {
              return {
                coefficient: left.coefficient / right.constant,
                power: left.power,
                constant: left.constant / right.constant
              };
            } else {
              throw new Error('Cannot solve equations with variable division');
            }
          
          case '^':
            if (left.coefficient !== 0 && right.coefficient === 0) {
              const power = right.constant;
              if (power === Math.floor(power) && power > 0) {
                return {
                  coefficient: left.coefficient === 1 ? 1 : Math.pow(left.coefficient, power),
                  power: left.power * power,
                  constant: left.constant === 0 ? 0 : Math.pow(left.constant, power)
                };
              } else {
                throw new Error('Only positive integer powers are supported');
              }
            } else {
              throw new Error('Cannot solve equations with variable in exponent');
            }
          
          case 'sqrt':
            if (left.coefficient !== 0) {
              if (left.power === 2) {
                return {
                  coefficient: left.coefficient,
                  power: 1,
                  constant: Math.sqrt(left.constant)
                };
              } else {
                throw new Error('Cannot solve square root of non-quadratic variable');
              }
            } else {
              return {
                coefficient: 0,
                power: 0,
                constant: Math.sqrt(left.constant)
              };
            }
          
          default:
            throw new Error(`Unknown operation: ${node.operation}`);
        }
      
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }
}

export class Inequality {
  constructor(
    private left: Expression,
    private operator: '>' | '<',
    private right: Expression | number
  ) {}

  evaluate(variables: Record<string, number> = {}): boolean {
    const leftValue = this.left.evaluate(variables);
    const rightValue = typeof this.right === 'number' 
      ? this.right 
      : this.right.evaluate(variables);
    
    return this.operator === '>' ? leftValue > rightValue : leftValue < rightValue;
  }

  solve(): number | null {
    const rightExpr = typeof this.right === 'number' 
      ? Expression.number(this.right) 
      : this.right;
    
    const leftVars = this.left.getVariables();
    const rightVars = rightExpr.getVariables();
    const allVars = [...new Set([...leftVars, ...rightVars])];
    
    if (allVars.length !== 1) {
      throw new Error('Can only solve inequalities with exactly one variable');
    }
    
    const variable = allVars[0];
    return this.solveForVariable(variable);
  }

  private solveForVariable(variable: string): number | null {
    try {
      const combined = this.left.subtract(typeof this.right === 'number' ? this.right : this.right);
      const linearForm = combined.getLinearForm(variable);
      
      // 对于不等式 ax^n + b = 0，解为 x = (-b/a)^(1/n)
      if (linearForm.coefficient === 0) {
        return null; // 没有变量项，无解
      }
      
      const constantTerm = -linearForm.constant;
      const coefficient = linearForm.coefficient;
      const power = linearForm.power;
      
      if (power === 1) {
        // 线性不等式: ax + b = 0 => x = -b/a
        return constantTerm / coefficient;
      } else if (power === 2) {
        // 二次不等式: ax^2 + b = 0 => x = ±√(-b/a)
        const discriminant = constantTerm / coefficient;
        if (discriminant < 0) {
          return null; // 无实数解
        }
        return Math.sqrt(discriminant); // 返回正解
      } else {
        // 高次方程: ax^n + b = 0 => x = (-b/a)^(1/n)
        const base = constantTerm / coefficient;
        if (power % 2 === 0 && base < 0) {
          return null; // 偶次方根的负数无实数解
        }
        return Math.pow(Math.abs(base), 1 / power) * (base < 0 ? -1 : 1);
      }
    } catch {
      return null;
    }
  }
}

export class Equation {
  constructor(
    private left: Expression,
    private right: Expression | number
  ) {}

  evaluate(variables: Record<string, number> = {}): boolean {
    const leftValue = this.left.evaluate(variables);
    const rightValue = typeof this.right === 'number' 
      ? this.right 
      : this.right.evaluate(variables);
    
    return Math.abs(leftValue - rightValue) < 1e-10;
  }

  solve(): number | null {
    const rightExpr = typeof this.right === 'number' 
      ? Expression.number(this.right) 
      : this.right;
    
    const leftVars = this.left.getVariables();
    const rightVars = rightExpr.getVariables();
    const allVars = [...new Set([...leftVars, ...rightVars])];
    
    if (allVars.length !== 1) {
      throw new Error('Can only solve equations with exactly one variable');
    }
    
    const variable = allVars[0];
    return this.solveForVariable(variable);
  }

  private solveForVariable(variable: string): number | null {
    try {
      const combined = this.left.subtract(typeof this.right === 'number' ? this.right : this.right);
      const linearForm = combined.getLinearForm(variable);
      
      // 对于方程 ax^n + b = 0，解为 x = (-b/a)^(1/n)
      if (linearForm.coefficient === 0) {
        // 没有变量项，检查常数项
        if (Math.abs(linearForm.constant) < 1e-10) {
          return 0; // 恒等式，任意值都是解，返回0
        } else {
          return null; // 矛盾，无解
        }
      }
      
      const constantTerm = -linearForm.constant;
      const coefficient = linearForm.coefficient;
      const power = linearForm.power;
      
      if (power === 1) {
        // 线性方程: ax + b = 0 => x = -b/a
        return constantTerm / coefficient;
      } else if (power === 2) {
        // 二次方程: ax^2 + b = 0 => x = ±√(-b/a)
        const discriminant = constantTerm / coefficient;
        if (discriminant < 0) {
          return null; // 无实数解
        }
        return Math.sqrt(discriminant); // 返回正解
      } else {
        // 高次方程: ax^n + b = 0 => x = (-b/a)^(1/n)
        const base = constantTerm / coefficient;
        if (power % 2 === 0 && base < 0) {
          return null; // 偶次方根的负数无实数解
        }
        return Math.pow(Math.abs(base), 1 / power) * (base < 0 ? -1 : 1);
      }
    } catch {
      return null;
    }
  }
}