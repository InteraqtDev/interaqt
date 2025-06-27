import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName } from '@';
import { entities, relations, interactions, activities } from '../src/index.js';

describe('调试Interaction注册问题', () => {
  let system: MonoSystem;
  let controller: Controller;
  
  beforeEach(async () => {
    system = new MonoSystem();
    system.conceptClass = KlassByName;
    
    controller = new Controller(
      system,
      entities,
      relations,
      activities,
      interactions,
      [],
      []
    );
    
    await controller.setup(true);
  });

  test('检查interactions是否正确注册', async () => {
    console.log('所有交互数量:', interactions.length);
    console.log('交互名称:', interactions.map(i => i.name));
    
    // 检查activityManager
    console.log('activityManager存在:', !!controller.activityManager);
    console.log('interactionCallsByName存在:', !!controller.activityManager?.interactionCallsByName);
    
    if (controller.activityManager?.interactionCallsByName) {
      console.log('已注册的交互名称:', Array.from(controller.activityManager.interactionCallsByName.keys()));
    }
    
    // 尝试查找特定的交互
    const createDormitoryCall = controller.activityManager?.interactionCallsByName.get('CreateDormitory');
    console.log('CreateDormitory交互调用:', !!createDormitoryCall);
    
    if (createDormitoryCall) {
      console.log('CreateDormitory UUID:', createDormitoryCall.interaction.uuid);
    }
  });

  test('尝试通过UUID调用交互', async () => {
    // 创建管理员用户
    const admin = await system.storage.create('User', {
      name: '测试管理员',
      role: 'admin',
      email: 'test@admin.com'
    });

    // 获取CreateDormitory的UUID
    const createDormitoryCall = controller.activityManager?.interactionCallsByName.get('CreateDormitory');
    
    if (!createDormitoryCall) {
      throw new Error('无法找到CreateDormitory交互');
    }

    const interactionId = createDormitoryCall.interaction.uuid;
    console.log('使用UUID调用:', interactionId);

    const result = await controller.callInteraction(interactionId, {
      user: admin,
      payload: {
        name: 'UUID测试宿舍',
        building: 'UUID栋',
        roomNumber: 'UUID001',
        capacity: 4,
        description: '通过UUID调用创建的宿舍'
      }
    });
    
    expect(result.error).toBeFalsy(); // 期望没有错误
    console.log('UUID调用成功:', result);
    expect(result).toBeTruthy();
  });

  test('检查Interaction实例', async () => {
    // 导入CreateDormitory交互
    const { CreateDormitory } = await import('../src/interactions.js');
    
    console.log('CreateDormitory实例:', !!CreateDormitory);
    console.log('CreateDormitory名称:', CreateDormitory.name);
    console.log('CreateDormitory UUID:', CreateDormitory.uuid);
    
    // 检查是否在Interaction.instances中
    const { Interaction } = await import('@');
    console.log('Interaction.instances存在:', !!Interaction.instances);
    
    if (Interaction.instances) {
      console.log('总计Interaction实例数:', Interaction.instances.length);
      const foundInteraction = Interaction.instances.find(i => i.name === 'CreateDormitory');
      console.log('找到CreateDormitory实例:', !!foundInteraction);
      
      if (foundInteraction) {
        console.log('实例UUID:', foundInteraction.uuid);
      }
    }
  });
});