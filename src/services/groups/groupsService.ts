import type { OffgridDb } from '../../database';
import {
  GroupMemberRepo,
  GroupRepo,
  UserRepo,
} from '../../database/repositories';
import type { Group, GroupMember } from '../../types/entities';
import type { GroupId, GroupMemberId, UserId } from '../../types/ids';
import { newUuidV7 } from '../../utils/ids';
import {
  GROUP_MEMBER_LIMIT,
  GROUP_NAME_MAX_LENGTH,
  GROUP_NAME_MIN_LENGTH,
} from './constants';
import { GroupsError } from './errors';
import { deriveJoinCode, joinCodesMatch } from './joinCode';

export interface GroupSummary {
  readonly group: Group;
  readonly memberCount: number;
  readonly localRole: GroupMember['role'];
  readonly joinCode: string;
}

export interface GroupDetail {
  readonly group: Group;
  readonly members: readonly GroupMember[];
  readonly localMembership: GroupMember | null;
  readonly joinCode: string;
}

export interface CreateGroupInput {
  readonly name: string;
  readonly creatorUserId: UserId;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
}

export interface JoinByCodeInput {
  readonly code: string;
  readonly userId: UserId;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
}

export interface LeaveGroupInput {
  readonly groupId: GroupId;
  readonly userId: UserId;
  readonly nowIso?: () => string;
}

export interface RemoveMemberInput {
  readonly groupId: GroupId;
  readonly actorUserId: UserId;
  readonly targetUserId: UserId;
  readonly nowIso?: () => string;
}

export interface RenameGroupInput {
  readonly groupId: GroupId;
  readonly actorUserId: UserId;
  readonly name: string;
  readonly nowIso?: () => string;
}

export interface CreateGroupResult {
  readonly group: Group;
  readonly membership: GroupMember;
}

export function createGroup(
  db: OffgridDb,
  input: CreateGroupInput,
): CreateGroupResult {
  const name = validateName(input.name);
  const nowIso = (input.nowIso ?? (() => new Date().toISOString()))();
  const generateId = input.generateId ?? newUuidV7;
  requireUser(db, input.creatorUserId);

  const groupId = generateId() as GroupId;
  const membershipId = generateId() as GroupMemberId;

  let group!: Group;
  let membership!: GroupMember;
  db.transaction(tx => {
    group = GroupRepo.insertGroup(tx, {
      id: groupId,
      name,
      createdBy: input.creatorUserId,
      nowIso,
    });
    membership = GroupMemberRepo.insertGroupMember(tx, {
      id: membershipId,
      groupId,
      userId: input.creatorUserId,
      role: 'admin',
      nowIso,
    });
  });
  return { group, membership };
}

export interface JoinByCodeResult {
  readonly group: Group;
  readonly membership: GroupMember;
  readonly alreadyMember: boolean;
}

export function joinGroupByCode(
  db: OffgridDb,
  input: JoinByCodeInput,
): JoinByCodeResult {
  const nowIso = (input.nowIso ?? (() => new Date().toISOString()))();
  const generateId = input.generateId ?? newUuidV7;
  requireUser(db, input.userId);

  const target = findGroupByCode(db, input.code);
  if (!target) {
    throw new GroupsError('INVALID_JOIN_CODE', 'No group matches that code.');
  }

  const existing = GroupMemberRepo.findMembership(db, target.id, input.userId);
  if (existing && existing.status === 'active') {
    return { group: target, membership: existing, alreadyMember: true };
  }

  const active = GroupMemberRepo.countActiveMembersInGroup(db, target.id);
  if (active >= GROUP_MEMBER_LIMIT) {
    throw new GroupsError(
      'MEMBER_LIMIT_REACHED',
      `Group is full (limit ${GROUP_MEMBER_LIMIT}).`,
    );
  }

  let membership!: GroupMember;
  db.transaction(tx => {
    if (existing) {
      membership = GroupMemberRepo.reactivateMembership(
        tx,
        existing.id,
        'member',
        nowIso,
      );
    } else {
      const membershipId = generateId() as GroupMemberId;
      membership = GroupMemberRepo.insertGroupMember(tx, {
        id: membershipId,
        groupId: target.id,
        userId: input.userId,
        role: 'member',
        nowIso,
      });
    }
  });
  return { group: target, membership, alreadyMember: false };
}

export function leaveGroup(db: OffgridDb, input: LeaveGroupInput): GroupMember {
  const nowIso = (input.nowIso ?? (() => new Date().toISOString()))();
  const membership = GroupMemberRepo.findMembership(
    db,
    input.groupId,
    input.userId,
  );
  if (!membership || membership.status !== 'active') {
    throw new GroupsError('NOT_A_MEMBER', 'You are not in this group.');
  }
  if (membership.role === 'admin') {
    const others = GroupMemberRepo.listActiveMembersForGroup(
      db,
      input.groupId,
    ).filter(m => m.userId !== input.userId);
    const otherAdmins = others.filter(m => m.role === 'admin');
    if (others.length > 0 && otherAdmins.length === 0) {
      throw new GroupsError(
        'LAST_ADMIN_WITH_MEMBERS',
        'Promote another admin before leaving.',
      );
    }
  }
  return GroupMemberRepo.markMembershipLeft(db, membership.id, nowIso);
}

export function removeMember(
  db: OffgridDb,
  input: RemoveMemberInput,
): GroupMember {
  if (input.actorUserId === input.targetUserId) {
    throw new GroupsError(
      'CANNOT_REMOVE_SELF',
      'Use "Leave group" to remove yourself.',
    );
  }
  const nowIso = (input.nowIso ?? (() => new Date().toISOString()))();
  const actor = requireActiveMembership(db, input.groupId, input.actorUserId);
  if (actor.role !== 'admin') {
    throw new GroupsError('NOT_ADMIN', 'Only admins can remove members.');
  }
  const target = GroupMemberRepo.findMembership(
    db,
    input.groupId,
    input.targetUserId,
  );
  if (!target || target.status !== 'active') {
    throw new GroupsError('NOT_A_MEMBER', 'That user is not in the group.');
  }
  return GroupMemberRepo.markMembershipRemoved(db, target.id, nowIso);
}

export function renameGroup(db: OffgridDb, input: RenameGroupInput): Group {
  const name = validateName(input.name);
  const nowIso = (input.nowIso ?? (() => new Date().toISOString()))();
  const actor = requireActiveMembership(db, input.groupId, input.actorUserId);
  if (actor.role !== 'admin') {
    throw new GroupsError('NOT_ADMIN', 'Only admins can rename a group.');
  }
  return GroupRepo.updateGroupName(db, input.groupId, name, nowIso);
}

export function listGroupsForUser(
  db: OffgridDb,
  userId: UserId,
): GroupSummary[] {
  const memberships = GroupMemberRepo.listActiveMembershipsForUser(db, userId);
  const summaries: GroupSummary[] = [];
  for (const membership of memberships) {
    const group = GroupRepo.findGroupById(db, membership.groupId);
    if (!group) {
      continue;
    }
    const memberCount = GroupMemberRepo.countActiveMembersInGroup(
      db,
      group.id,
    );
    summaries.push({
      group,
      memberCount,
      localRole: membership.role,
      joinCode: deriveJoinCode(group.id),
    });
  }
  return summaries;
}

export function getGroupDetail(
  db: OffgridDb,
  groupId: GroupId,
  localUserId: UserId,
): GroupDetail {
  const group = GroupRepo.findGroupById(db, groupId);
  if (!group) {
    throw new GroupsError('GROUP_NOT_FOUND', 'Group not found.');
  }
  const members = GroupMemberRepo.listActiveMembersForGroup(db, groupId);
  const localMembership =
    members.find(m => m.userId === localUserId) ?? null;
  return {
    group,
    members,
    localMembership,
    joinCode: deriveJoinCode(group.id),
  };
}

// --- helpers ---

function validateName(raw: string): string {
  const trimmed = raw.trim();
  if (
    trimmed.length < GROUP_NAME_MIN_LENGTH ||
    trimmed.length > GROUP_NAME_MAX_LENGTH
  ) {
    throw new GroupsError('INVALID_NAME', 'Group name is invalid.');
  }
  return trimmed;
}

function requireUser(db: OffgridDb, userId: UserId): void {
  if (!UserRepo.findUserById(db, userId)) {
    throw new GroupsError('NOT_A_MEMBER', 'Unknown user.');
  }
}

function requireActiveMembership(
  db: OffgridDb,
  groupId: GroupId,
  userId: UserId,
): GroupMember {
  const membership = GroupMemberRepo.findMembership(db, groupId, userId);
  if (!membership || membership.status !== 'active') {
    throw new GroupsError('NOT_A_MEMBER', 'You are not in this group.');
  }
  return membership;
}

function findGroupByCode(db: OffgridDb, code: string): Group | null {
  const groups = GroupRepo.listGroups(db);
  for (const g of groups) {
    if (g.status !== 'active') {
      continue;
    }
    if (joinCodesMatch(deriveJoinCode(g.id), code)) {
      return g;
    }
  }
  return null;
}
