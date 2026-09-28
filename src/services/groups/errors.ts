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
  | 'LAST_ADMIN_WITH_MEMBERS'
  // D-075: emitted by the join service when the local device has no active
  // CommunicationManager to broadcast a nearby request. Distinct from
  // INVALID_JOIN_CODE so the UI can prompt the user to enable comms first.
  | 'NO_CONNECTION';

export class GroupsError extends Error {
  readonly code: GroupsErrorCode;
  constructor(code: GroupsErrorCode, message: string) {
    super(message);
    this.name = 'GroupsError';
    this.code = code;
  }
}
