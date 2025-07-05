export * from './StyleInteractions';
export * from './VersionInteractions';
export * from './QueryInteractions';

import { 
  CreateStyle, 
  UpdateStyle, 
  DeleteStyle, 
  PublishStyle, 
  UpdateStyleOrder 
} from './StyleInteractions';
import { RollbackVersion } from './VersionInteractions';
import { 
  GetStyles, 
  GetStyleDetail, 
  GetVersionHistory 
} from './QueryInteractions';

export const interactions = [
  // Style management
  CreateStyle,
  UpdateStyle,
  DeleteStyle,
  PublishStyle,
  UpdateStyleOrder,
  // Version management
  RollbackVersion,
  // Queries
  GetStyles,
  GetStyleDetail,
  GetVersionHistory
]; 