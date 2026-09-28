import type { OffgridDb } from '../../database';
import {
  GroupMemberRepo,
  GroupRepo,
  UserRepo,
} from '../../database/repositories';
import type { CommunicationManager } from '../communication/CommunicationManager';
import type {
  GroupJoinInviteBody,
  GroupJoinInviteMember,
  MessageEnvelope,
} from '../../types/communication';
import type { GroupId, UserId } from '../../types/ids';
import { deriveJoinCode, joinCodesMatch } from './joinCode';
import { joinGroupByCode } from './groupsService';
import { GroupsError } from './errors';

// Group join V1 responder (D-075).
//
// Contract:
//   - Subscribe to `groupJoinRequestEnvelopeReceived` on the manager.
//   - If the local user is an active member of a group whose derived join
//     code matches the request, install the joiner locally (insertUser +
//     joinGroupByCode) and unicast back a `group.join.invite` envelope
//     containing the group snapshot.
//   - Only one group per code should be returned — codes are derived from a
//     UUIDv7 so collisions are astronomically unlikely; if the local user
//     happens to be in multiple matching groups, pick the first (deterministic
//     by group creation order via `listActiveMembershipsForUser`).
//   - Silent on failure: never leak the reason to the requester. Log via
//     console.warn with a stable prefix so diagnostics can grep it
//     (CLAUDE.md §13 privacy, §28 logging).
//
// The returned handle detaches the listener. Callers own the lifecycle
// (see `groupJoinRuntime.ts`).

export interface StartGroupJoinResponderOptions {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager;
  readonly localUserId: UserId;
  readonly nowIso?: () => string;
}

const LOG_PREFIX = '[group-join-responder]';

export function startGroupJoinResponder(
  options: StartGroupJoinResponderOptions,
): () => void {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  return options.manager.on(event => {
    if (event.kind !== 'groupJoinRequestEnvelopeReceived') return;
    handleRequest(options, event.envelope, nowIso()).catch(err => {
      console.warn(`${LOG_PREFIX} error:`, err instanceof Error ? err.message : err);
    });
  });
}

async function handleRequest(
  options: StartGroupJoinResponderOptions,
  envelope: MessageEnvelope,
  now: string,
): Promise<void> {
  if (envelope.body.kind !== 'group.join.request') return;
  const payload = envelope.body.payload;

  // Ignore requests where I am the joiner (loopback / echo).
  if ((payload.joinerUserId as unknown as string) === (options.localUserId as unknown as string)) {
    return;
  }

  const group = findLocalMatchingGroup(
    options.db,
    payload.code,
    options.localUserId,
  );
  if (!group) {
    // Not ours — silent no-op. Do not tell the requester "you asked me".
    return;
  }

  // Ensure the joiner has a user row locally before we can enrol them.
  if (!UserRepo.findUserById(options.db, payload.joinerUserId)) {
    UserRepo.insertUser(options.db, {
      id: payload.joinerUserId,
      displayName: payload.joinerDisplayName,
      nowIso: now,
    });
  }

  // Local enrolment. joinGroupByCode is idempotent for active members and
  // reactivates prior 'left' rows. If we hit MEMBER_LIMIT_REACHED we still
  // fall through without responding — no honest way to represent "the group
  // is full" over the wire yet.
  try {
    joinGroupByCode(options.db, {
      code: payload.code,
      userId: payload.joinerUserId,
      nowIso: () => now,
    });
  } catch (err) {
    if (err instanceof GroupsError) {
      console.warn(`${LOG_PREFIX} local enrol failed: ${err.code}`);
      return;
    }
    throw err;
  }

  const members = snapshotMembers(options.db, group.id);
  const body: GroupJoinInviteBody = {
    kind: 'group.join.invite',
    payload: {
      code: payload.code,
      groupId: group.id,
      groupName: group.name,
      groupCreatedAt: group.createdAt,
      joinerUserId: payload.joinerUserId,
      members,
    },
  };
  await options.manager.sendGroupJoinInviteEnvelope(
    body,
    envelope.originDeviceId,
  );
}

function findLocalMatchingGroup(
  db: OffgridDb,
  code: string,
  localUserId: UserId,
) {
  // Only groups where the local user is an active member — otherwise a
  // random device with a stale group row could still respond, which would
  // be misleading and privacy-violating (CLAUDE.md §13).
  const memberships = GroupMemberRepo.listActiveMembershipsForUser(
    db,
    localUserId,
  );
  for (const membership of memberships) {
    const group = GroupRepo.findGroupById(db, membership.groupId);
    if (!group) continue;
    if (group.status !== 'active') continue;
    if (group.isDirect) continue;
    if (joinCodesMatch(deriveJoinCode(group.id), code)) {
      return group;
    }
  }
  return null;
}

function snapshotMembers(
  db: OffgridDb,
  groupId: GroupId,
): readonly GroupJoinInviteMember[] {
  const rows = GroupMemberRepo.listActiveMembersForGroup(db, groupId);
  const out: GroupJoinInviteMember[] = [];
  for (const m of rows) {
    const user = UserRepo.findUserById(db, m.userId);
    if (!user) continue;
    out.push({
      userId: m.userId,
      displayName: user.displayName,
      role: m.role,
      joinedAt: m.joinedAt,
    });
  }
  return out;
}
