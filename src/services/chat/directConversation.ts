import type { OffgridDb } from '../../database';
import {
  GroupMemberRepo,
  GroupRepo,
} from '../../database/repositories';
import type { Group } from '../../types/entities';
import type { GroupMemberId, UserId } from '../../types/ids';
import { deriveDirectGroupId, newUuidV7 } from '../../utils/ids';

// D-074. Direct 1-to-1 conversations are modelled as a synthetic private
// group with `is_direct = 1`. The group id is derived deterministically from
// the sorted pair of userIds so both devices arrive at the same GroupId
// without a handshake.
//
// This helper is idempotent: calling it a second time returns the existing
// group. It verifies (and only verifies — never repairs) the invariant that
// a direct group has exactly two active memberships, one per participant.
// A mismatched invariant throws instead of silently repairing: repairing
// could hide a bug or racing state that the caller needs to see.

export interface EnsureDirectConversationInput {
  readonly userA: UserId;
  readonly userB: UserId;
  readonly nowIso: string;
  readonly generateId?: () => string;
}

export class DirectConversationInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectConversationInvariantError';
  }
}

export function ensureDirectConversation(
  db: OffgridDb,
  input: EnsureDirectConversationInput,
): Group {
  const { userA, userB, nowIso } = input;
  const generateId = input.generateId ?? newUuidV7;
  const groupId = deriveDirectGroupId(userA, userB);

  const existing = GroupRepo.findGroupById(db, groupId);
  if (existing) {
    if (!existing.isDirect) {
      throw new DirectConversationInvariantError(
        `Group ${groupId} exists but is not flagged is_direct`,
      );
    }
    const members = GroupMemberRepo.listActiveMembersForGroup(db, groupId);
    const memberUsers = new Set(members.map(m => m.userId as string));
    if (
      members.length !== 2 ||
      !memberUsers.has(userA as string) ||
      !memberUsers.has(userB as string)
    ) {
      throw new DirectConversationInvariantError(
        `Direct group ${groupId} does not have exactly [userA, userB] as active members`,
      );
    }
    return existing;
  }

  let created!: Group;
  db.transaction(tx => {
    created = GroupRepo.insertGroup(tx, {
      id: groupId,
      // Direct-conversation groups do not have a user-facing name in V1;
      // the UI renders participant identities instead. Store a stable
      // internal name so the row is not empty and diagnostics can still
      // recognise it at a glance.
      name: '__direct',
      createdBy: null,
      nowIso,
      isDirect: true,
    });
    GroupMemberRepo.insertGroupMember(tx, {
      id: generateId() as GroupMemberId,
      groupId,
      userId: userA,
      role: 'member',
      nowIso,
    });
    GroupMemberRepo.insertGroupMember(tx, {
      id: generateId() as GroupMemberId,
      groupId,
      userId: userB,
      role: 'member',
      nowIso,
    });
  });
  return created;
}
