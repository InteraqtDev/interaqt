import { describe, it, expect } from 'vitest';
import { ComputationError } from 'interaqt';


// 直接导入错误类
class TestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TestError';
    }
}

// 使用动态导入来避免编译问题
describe('FrameworkError console output', () => {
    it('should format error with chain for console output', async () => {
        
        // 创建错误链
        const rootError = new Error('Database connection timeout');
        const middleError = new ComputationError('Failed to fetch data', {
            handleName: 'DataHandle',
            computationName: 'UserStats',
            causedBy: rootError
        });
        const topError = new ComputationError('Failed to compute statistics', {
            computationName: 'MonthlyStats',
            computationPhase: 'aggregation',
            context: { month: '2024-01' },
            causedBy: middleError
        });

        // 测试 toString 方法
        const stringOutput = topError.toString();
        console.log('\n=== toString() output ===');
        console.log(stringOutput);
        
        // 验证输出包含必要信息
        expect(stringOutput).toContain('[ComputationError]');
        expect(stringOutput).toContain('Failed to compute statistics');
        expect(stringOutput).toContain('computationName: MonthlyStats');
        expect(stringOutput).toContain('Caused by:');
        expect(stringOutput).toContain('→ ComputationError: Failed to fetch data');
        expect(stringOutput).toContain('→ Error: Database connection timeout');
        expect(stringOutput).toContain('Stack trace:');

        // 实际使用 console 打印
        console.log('\n=== Actual console.log ===');
        console.log(topError);
        
        console.log('\n=== Actual console.error ===');
        console.error(topError);
    });

    it('should format single error without chain', async () => {
        const { ComputationError } = await import('../../src/runtime/errors/ComputationErrors.js');
        
        const error = new ComputationError('Invalid parameter', {
            handleName: 'Calculator',
            computationName: 'Average',
            dataContext: { values: [1, 2, 'invalid'] }
        });

        const output = error.toString();
        console.log('\n=== Single error output ===');
        console.log(output);

        expect(output).toContain('[ComputationError]');
        expect(output).toContain('Invalid parameter');
        expect(output).toContain('handleName: Calculator');
        expect(output).toContain('computationName: Average');
    });
});
