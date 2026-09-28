import type { OffgridDb } from '../../database';
import {
  GroupMemberRepo,
  GroupRepo,
  UserRepo,
} from '../../database/repositories';
import type { CommunicationManager } from '../communication/CommunicationManager';
import type {
  GroupJoinInviteBody,
  GroupJoinRequestBody,
  MessageEnvelope,
} from '../../types/communication';
import type { Group, GroupMember } from '../../types/entities';
import type { GroupMemberId, UserId } from '../../types/ids';
import { newUuidV7 } from '../../utils/ids';
import { GroupsError } from './errors';
import {
  deriveJoinCode,
  joinCodesMatch,
  normalizeJoinCode,
} from './joinCode';
import { JOIN_CODE_LENGTH } from './constants';
import { joinGroupByCode as joinLocalByCode } from './groupsService';

// Group join V1 service (D-075).
//
// Two-phase flow:
//   1. Local fast-path: if the code matches a group already present on this
//      device (e.g., a previous join / rejoin), delegate to `joinGroupByCode`.
//   2. Nearby request: otherwise, send a `group.join.request` envelope over
//      the active CommunicationManager and wait for a matching
//      `group.join.invite` from any nearby member. Install the group + its
//      active member set locally and enrol the joiner as a `member`.
//
// The wait is bounded by `timeoutMs`. On timeout we throw a typed
// `GroupsError('INVALID_JOIN_CODE', …)` — from the user's perspective the
// outcome is indistinguishable between "wrong code" and "no nearby member
// hosts a group with that code", and lying either way would be a §14/§20
// violation. If no manager is registered we throw a
// `GroupsError('NO_CONNECTION', …)`.

export const DEFAULT_JOIN_TIMEOUT_MS = 8000;

export interface RequestJoinByCodeOptions {
  readonly db: OffgridDb;
  readonly manager: CommunicationManager | null;
  readonly code: string;
  readonly joinerUserId: UserId;
  readonly joinerDisplayName: string;
  readonly timeoutMs?: number;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
}

export interface RequestJoinByCodeResult {
  readonly group: Group;
  readonly membership: GroupMember;
  readonly source: 'local' | 'nearby';
  readonly alreadyMember: boolean;
}

export async function requestJoinByCode(
  options: RequestJoinByCodeOptions,
): Promise<RequestJoinByCodeResult> {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const generateId = options.generateId ?? newUuidV7;

  const normalized = normalizeJoinCode(options.code);
  if (normalized.length !== JOIN_CODE_LENGTH) {
    throw new GroupsError(
      'INVALID_JOIN_CODE',
      `Enter a ${JOIN_CODE_LENGTH}-character join code.`,
    );
  }

  // Phase 1: local fast-path. Works for rejoin after leaving, or when this
  // device already learned about the group through a previous invite.
  try {
    const local = joinLocalByCode(options.db, {
      code: normalized,
      userId: options.joinerUserId,
      nowIso,
    });
    return {
      group: local.group,
      membership: local.membership,
      source: 'local',
      alreadyMember: local.alreadyMember,
    };
  } catch (err) {
    if (!(err instanceof GroupsError) || err.code !== 'INVALID_JOIN_CODE') {
      throw err;
    }
    // Fall through — try nearby.
  }

  // Phase 2: nearby request.
  if (!options.manager) {
    throw new GroupsError(
      'NO_CONNECTION',
      'Enable OFFGRID connectivity, then try again.',
    );
  }

  const invite = await awaitMatchingInvite({
    manager: options.manager,
    code: normalized,
    joinerUserId: options.joinerUserId,
    joinerDisplayName: options.joinerDisplayName,
    timeoutMs: options.timeoutMs ?? DEFAULT_JOIN_TIMEOUT_MS,
  });

  return installInvite({
    db: options.db,
    invite,
    joinerUserId: options.joinerUserId,
    now: nowIso(),
    generateId,
  });
}

interface AwaitInviteOptions {
  readonly manager: CommunicationManager;
  readonly code: string;
  readonly joinerUserId: UserId;
  readonly joinerDisplayName: string;
  readonly timeoutMs: number;
}

function awaitMatchingInvite(
  options: AwaitInviteOptions,
): Promise<GroupJoinInviteBody> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const unsubscribe = options.manager.on(event => {
      if (settled) return;
      if (event.kind !== 'groupJoinInviteEnvelopeReceived') return;
      const match = matchesInvite(event.envelope, options);
      if (!match) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(match);
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(
        new GroupsError(
          'INVALID_JOIN_CODE',
          'No nearby OFFGRID device replied. Check the code or move closer.',
        ),
      );
    }, options.timeoutMs);

    const body: GroupJoinRequestBody = {
      kind: 'group.join.request',
      payload: {
        code: options.code,
        joinerUserId: options.joinerUserId,
        joinerDisplayName: options.joinerDisplayName,
      },
    };
    options.manager.sendGroupJoinRequestEnvelope(body).catch(err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      reject(err);
    });
  });
}

function matchesInvite(
  envelope: MessageEnvelope,
  options: AwaitInviteOptions,
): GroupJoinInviteBody | null {
  if (envelope.body.kind !== 'group.join.invite') return null;
  const payload = envelope.body.payload;
  if ((payload.joinerUserId as unknown as string) !== (options.joinerUserId as unknown as string)) {
    return null;
  }
  if (!joinCodesMatch(payload.code, options.code)) return null;
  return envelope.body;
}

interface InstallInviteOptions {
  readonly db: OffgridDb;
  readonly invite: GroupJoinInviteBody;
  readonly joinerUserId: UserId;
  readonly now: string;
  readonly generateId: () => string;
}

function installInvite(
  options: InstallInviteOptions,
): RequestJoinByCodeResult {
  const payload = options.invite.payload;
  let group: Group;
  let membership: GroupMember;
  let alreadyMember = false;

  options.db.transaction(tx => {
    const existingGroup = GroupRepo.findGroupById(tx, payload.groupId);
    if (!existingGroup) {
      group = GroupRepo.insertGroup(tx, {
        id: payload.groupId,
        name: payload.groupName,
        createdBy: null,
        nowIso: payload.groupCreatedAt,
      });
    } else {
      group = existingGroup;
    }

    // Install each remote member idempotently. Skip if user row missing and
    // can be created; then insert / reactivate membership as appropriate.
    for (const m of payload.members) {
      if (!UserRepo.findUserById(tx, m.userId)) {
        UserRepo.insertUser(tx, {
          id: m.userId,
          displayName: m.displayName,
          nowIso: m.joinedAt,
        });
      }
      const existing = GroupMemberRepo.findMembership(
        tx,
        payload.groupId,
        m.userId,
      );
      if (!existing) {
        GroupMemberRepo.insertGroupMember(tx, {
          id: options.generateId() as GroupMemberId,
          groupId: payload.groupId,
          userId: m.userId,
          role: m.role,
          nowIso: m.joinedAt,
        });
      } else if (existing.status !== 'active') {
        GroupMemberRepo.reactivateMembership(
          tx,
          existing.id,
          m.role,
          m.joinedAt,
        );
      }
    }

    // Ensure the local joiner is present. The responder may or may not have
    // included the joiner in the snapshot yet — install defensively.
    const selfExisting = GroupMemberRepo.findMembership(
      tx,
      payload.groupId,
      options.joinerUserId,
    );
    if (!selfExisting) {
      membership = GroupMemberRepo.insertGroupMember(tx, {
        id: options.generateId() as GroupMemberId,
        groupId: payload.groupId,
        userId: options.joinerUserId,
        role: 'member',
        nowIso: options.now,
      });
    } else if (selfExisting.status !== 'active') {
      membership = GroupMemberRepo.reactivateMembership(
        tx,
        selfExisting.id,
        selfExisting.role,
        options.now,
      );
    } else {
      membership = selfExisting;
      alreadyMember = true;
    }
  });

  return {
    group: group!,
    membership: membership!,
    source: 'nearby',
    alreadyMember,
  };
}

// Test seam: same fast-path check as the local phase without any nearby
// request. Exposed so screens can query "is this code already installed
// locally?" — used by future presence UIs but currently unused.
export function findLocalGroupByCode(
  db: OffgridDb,
  code: string,
  localUserId: UserId,
): Group | null {
  const normalized = normalizeJoinCode(code);
  if (normalized.length !== JOIN_CODE_LENGTH) return null;
  const memberships = GroupMemberRepo.listActiveMembershipsForUser(
    db,
    localUserId,
  );
  for (const m of memberships) {
    const group = GroupRepo.findGroupById(db, m.groupId);
    if (!group || group.status !== 'active') continue;
    if (joinCodesMatch(deriveJoinCode(group.id), normalized)) {
      return group;
    }
  }
  return null;
}

