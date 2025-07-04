import * as fs from 'fs';
import * as path from 'path';

// 类配置
interface ClassConfig {
  name: string;
  properties: Array<{
    name: string;
    type: string;
    required?: boolean;
    defaultValue?: any;
  }>;
}

// 生成重构后的类代码
function generateRefactoredClass(config: ClassConfig): string {
  const { name, properties } = config;
  
  // 生成属性接口
  const instanceProps = properties.map(p => `  ${p.name}${p.required === false ? '?' : ''}: ${p.type};`).join('\n');
  const createArgsProps = properties.map(p => `  ${p.name}${p.required === false || p.defaultValue !== undefined ? '?' : ''}: ${p.type};`).join('\n');
  
  // 生成构造函数体
  const constructorBody = properties.map(p => {
    if (p.defaultValue !== undefined) {
      return `    this.${p.name} = args.${p.name} ?? ${p.defaultValue};`;
    } else {
      return `    this.${p.name} = args.${p.name};`;
    }
  }).join('\n');
  
  // 生成 public 定义
  const publicDef = properties.map(p => {
    const def: any = {
      type: `'${p.type}' as const`,
    };
    if (p.required !== false) {
      def.required = 'true as const';
    }
    if (p.defaultValue !== undefined) {
      def.defaultValue = `() => ${p.defaultValue}`;
    }
    
    const parts = [`    ${p.name}: {`];
    Object.entries(def).forEach(([key, value]) => {
      parts.push(`      ${key}: ${value},`);
    });
    parts.push('    }');
    return parts.join('\n');
  }).join(',\n');
  
  // 生成 getCreateArgs
  const getCreateArgs = properties.map(p => {
    if (p.defaultValue !== undefined || p.required === false) {
      return `    if (instance.${p.name} !== ${p.defaultValue ?? 'undefined'}) args.${p.name} = instance.${p.name};`;
    } else {
      return null;
    }
  }).filter(Boolean).join('\n');
  
  const requiredProps = properties.filter(p => p.required !== false && p.defaultValue === undefined);
  const createArgsInit = requiredProps.length > 0
    ? `    const args: ${name}CreateArgs = {\n${requiredProps.map(p => `      ${p.name}: instance.${p.name}`).join(',\n')}\n    };`
    : `    const args: ${name}CreateArgs = {};`;

  return `import { IInstance, SerializedData, generateUUID } from './interfaces.js';

// ${name} 实例接口
export interface ${name}Instance extends IInstance {
${instanceProps}
}

// ${name} 创建参数
export interface ${name}CreateArgs {
${createArgsProps}
}

// ${name} 类定义
export class ${name} implements ${name}Instance {
  public uuid: string;
  public _type = '${name}';
  public _options?: { uuid?: string };
${properties.map(p => `  public ${p.name}${p.required === false ? '?' : ''}: ${p.type};`).join('\n')}

  constructor(args: ${name}CreateArgs, options?: { uuid?: string }) {
    this._options = options;
    this.uuid = generateUUID(options);
${constructorBody}
  }

  // 静态属性和方法
  static isKlass = true as const;
  static displayName = '${name}';
  static instances: ${name}Instance[] = [];
  
  static public = {
${publicDef}
  };

  static create(args: ${name}CreateArgs, options?: { uuid?: string }): ${name}Instance {
    const instance = new ${name}(args, options);
    
    // 检查 uuid 是否重复
    const existing = this.instances.find(i => i.uuid === instance.uuid);
    if (existing) {
      throw new Error(\`duplicate uuid in options \${instance.uuid}, ${name}\`);
    }
    
    this.instances.push(instance);
    return instance;
  }

  static stringify(instance: ${name}Instance): string {
    const data: SerializedData<${name}CreateArgs> = {
      type: '${name}',
      options: instance._options,
      uuid: instance.uuid,
      public: ${requiredProps.length > 0 ? `{
        ${requiredProps.map(p => `${p.name}: instance.${p.name}`).join(',\n        ')}
      }` : '{}'}
    };
    return JSON.stringify(data);
  }

  static clone(instance: ${name}Instance, deep: boolean): ${name}Instance {
${createArgsInit}
${getCreateArgs}
    return this.create(args);
  }

  static is(obj: any): obj is ${name}Instance {
    return obj && obj._type === '${name}';
  }

  static check(data: any): boolean {
    return data && typeof data.uuid === 'string';
  }

  static parse(json: string): ${name}Instance {
    const data: SerializedData<${name}CreateArgs> = JSON.parse(json);
    return this.create(data.public, data.options);
  }
}`;
}

// 简单类的配置
const simpleClasses: ClassConfig[] = [
  {
    name: 'Event',
    properties: [
      { name: 'name', type: 'string' }
    ]
  },
  {
    name: 'StateNode',
    properties: [
      { name: 'name', type: 'string' },
      { name: 'computeValue', type: 'Function', required: false }
    ]
  },
  {
    name: 'Condition',
    properties: [
      { name: 'content', type: 'Function' },
      { name: 'name', type: 'string', required: false }
    ]
  },
  // 更多类配置...
];

// 生成文件
simpleClasses.forEach(config => {
  const code = generateRefactoredClass(config);
  const filePath = path.join(__dirname, '..', 'src/shared/refactored', `${config.name}_new.ts`);
  fs.writeFileSync(filePath, code);
  console.log(`Generated ${config.name}_new.ts`);
}); 