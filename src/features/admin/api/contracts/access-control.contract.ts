export const ACCESS_CONTROL_CONTRACT_VERSION = 1 as const;

export interface AccessPermissionDefinitionDto {
  category: string;
  description: string | null;
  key: string;
  label: string;
  sortOrder: number;
}

export interface AccessGroupDto {
  description: string | null;
  id: string;
  name: string;
  permissions: string[];
  slug: string;
  userCount: number;
}

export interface AccessUserDto {
  email: string | null;
  fullName: string;
  groupId: string | null;
  groupName: string | null;
  groupSlug: string | null;
  isAdmin: boolean;
  userId: string;
}

export interface AccessCollectionDto<TItem> {
  contractVersion: typeof ACCESS_CONTROL_CONTRACT_VERSION;
  items: TItem[];
}

export interface AccessUserPageDto extends AccessCollectionDto<AccessUserDto> {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface AccessGroupMutationDto {
  contractVersion: typeof ACCESS_CONTROL_CONTRACT_VERSION;
  created: boolean;
  groupId: string;
}

export interface AccessGroupDeletionDto {
  contractVersion: typeof ACCESS_CONTROL_CONTRACT_VERSION;
  groupId: string;
  reassignedUserCount: number;
}

export interface AccessUserMutationDto {
  contractVersion: typeof ACCESS_CONTROL_CONTRACT_VERSION;
  groupId: string | null;
  isAdmin: boolean;
  userId: string;
}
