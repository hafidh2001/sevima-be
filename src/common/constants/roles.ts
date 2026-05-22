// Role constants - matches Role table in database
export enum RoleName {
  ADMIN = 'ADMIN',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
}

// Role IDs from database seed
export const RoleIds = {
  [RoleName.ADMIN]: 1,
  [RoleName.EDITOR]: 2,
  [RoleName.VIEWER]: 3,
} as const;