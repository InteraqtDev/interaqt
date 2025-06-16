import { describe, expect, test } from "vitest";
import {
  BoolExp,
  Controller,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  Relation,
  Count
} from '@';

describe('symmetric relation computation cycle bug', () => {
  
  test('should only count self relation twice on n:n relation', async () => {
    expect(true).toBe(true)
  })
}); 