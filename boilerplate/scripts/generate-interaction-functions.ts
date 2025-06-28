#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径 (ES module)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 直接导入 interactions
import { interactions } from '../backend/index.js';

// 从 interactions 数组中提取信息
function extractInteractionInfo(): Array<{
  name: string;
  payloadParams: string[];
  isGetInteraction: boolean;
}> {
  const interactionInfos: Array<{
    name: string;
    payloadParams: string[];
    isGetInteraction: boolean;
  }> = [];
  
  interactions.forEach(interaction => {
    const name = interaction.name;
    const isGetInteraction = name.startsWith('Get');
    const payloadParams: string[] = [];
    
    // 如果有 payload，提取参数名称
    if (interaction.payload && interaction.payload.items) {
      interaction.payload.items.forEach((item: any) => {
        if (item.name) {
          payloadParams.push(item.name);
        }
      });
    }
    
    interactionInfos.push({
      name,
      payloadParams,
      isGetInteraction
    });
  });
  
  return interactionInfos;
}

// 生成函数类型和参数
function generateFunctionSignature(interactionName: string, payloadParams: string[]): {
  functionName: string;
  params: string;
  payloadObject: string;
} {
  // 转换函数名：CreateDormitory -> createDormitory
  const functionName = interactionName.charAt(0).toLowerCase() + interactionName.slice(1);
  
  if (payloadParams.length === 0) {
    return {
      functionName,
      params: 'query?: any',
      payloadObject: ''
    };
  }
  
  // 生成参数列表
  const params = payloadParams.map(param => `${param}: any`).join(', ') + (payloadParams.length > 0 ? ', query?: any' : 'query?: any');
  
  // 生成 payload 对象
  const payloadObject = payloadParams.length > 0 ? 
    `payload: { ${payloadParams.join(', ')} }` : 
    '';
  
  return { functionName, params, payloadObject };
}

// 生成前端函数代码
function generateFrontendFunctions(interactionInfos: Array<{name: string, payloadParams: string[], isGetInteraction: boolean}>): string {
  const functions: string[] = [];
  
  interactionInfos.forEach(({ name: interactionName, payloadParams, isGetInteraction }) => {
    const { functionName, params, payloadObject } = generateFunctionSignature(interactionName, payloadParams);
    
    // 构建请求对象
    let requestObject = `{
        interaction: '${interactionName}'`;
    
    if (payloadParams.length > 0) {
      requestObject += `,\n        ${payloadObject}`;
    }
    
    if (isGetInteraction || payloadParams.length === 0) {
      requestObject += `,\n        query`;
    }
    
    requestObject += `\n      }`;
    
    const functionCode = `
/**
 * ${interactionName} - Auto-generated function
 */
export async function ${functionName}(${params}): Promise<any> {
  const request: InteractionRequest = ${requestObject};
  
  const response = await fetch(\`\${BASE_URL}/interaction\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${getCurrentUserId()}\`
    },
    body: JSON.stringify(request)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || \`HTTP \${response.status}\`);
  }

  return result.data || result.result || result;
}`;
    
    functions.push(functionCode);
  });
  
  return functions.join('\n\n');
}

// 生成完整的文件内容
function generateFileContent(interactionInfos: Array<{name: string, payloadParams: string[], isGetInteraction: boolean}>): string {
  const functionsCode = generateFrontendFunctions(interactionInfos);
  const interactionNames = interactionInfos.map(info => info.name);
  
  return `/**
 * Auto-generated Interaction Functions
 * Generated from: src/interactions.ts
 * Generated at: ${new Date().toISOString()}
 * 
 * This file contains automatically generated functions for calling backend interactions.
 * Each function is a simple async function that returns the response data directly.
 */

// Base configuration
const BASE_URL = 'http://localhost:3000';

// Types
interface InteractionRequest {
  interaction: string;
  payload?: any;
  query?: any;
}

// Utility function to get current user ID (should be implemented by the app)
function getCurrentUserId(): string | null {
  // This should be implemented by the app
  // For now, try to get from URL params
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('userId') || null;
}

${functionsCode}

// Export all functions as a single object for convenience
export const interactionFunctions = {
${interactionNames.map(name => {
  const functionName = name.charAt(0).toLowerCase() + name.slice(1);
  return `  ${functionName}`;
}).join(',\n')}
};

// Export function names for reference
export const availableInteractions = [
${interactionNames.map(name => `  '${name}'`).join(',\n')}
];
`;
}

// 主执行函数
function main() {
  console.log('🔍 Analyzing interactions...');
  
  const interactionInfos = extractInteractionInfo();
  const interactionNames = interactionInfos.map(info => info.name);
  console.log(`📋 Found ${interactionNames.length} interactions:`, interactionNames);
  
  console.log('🔨 Generating frontend functions...');
  const fileContent = generateFileContent(interactionInfos);
  
  const outputPath = path.join(__dirname, 'frontend/src/utils/generatedInteractions.ts');
  fs.writeFileSync(outputPath, fileContent, 'utf-8');
  
  console.log('✅ Generated frontend functions successfully!');
  console.log(`📁 Output file: ${outputPath}`);
  console.log(`📊 Generated ${interactionNames.length} functions`);
  
  // 显示生成的函数名称
  console.log('\n📋 Generated functions:');
  interactionInfos.forEach(({ name, payloadParams }) => {
    const functionName = name.charAt(0).toLowerCase() + name.slice(1);
    console.log(`  - ${functionName}(${payloadParams.length > 0 ? payloadParams.join(', ') + ', query?' : 'query?'})`);
  });
}

// 运行脚本 (ES module)
main(); 