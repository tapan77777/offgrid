// Typed errors for the groups service. Callers (UI, tests) can inspect
// `code` to translate to user-facing copy or specific test expectations.

export type GroupsErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_JOIN_CODE'
  | 'GROUP_NOT_FOUND'
  | 'ALREADY_MEMBER'
  | 'NOT_A_MEMBER'
  | 'MEMBER_LIMIT_REACHED'
  | 'NOT_ADMIN'
  | 'CANNOT_REMOVE_SELF'
  | 'LAST_ADMIN_WITH_MEMBERS';

export class GroupsError extends Error {
  readonly code: GroupsErrorCode;
  constructor(code: GroupsErrorCode, message: string) {
    super(message);
    this.name = 'GroupsError';
    this.code = code;
  }
}
