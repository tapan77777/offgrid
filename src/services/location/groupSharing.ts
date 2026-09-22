import type { OffgridDb } from '../../database';
import {
  GroupLocationSharingRepo,
  GroupMemberRepo,
  GroupRepo,
  LocationRepo,
} from '../../database/repositories';
import type { Location as LocationEntity } from '../../types/entities';
import type {
  GroupId,
  GroupLocationSharingId,
  UserId,
} from '../../types/ids';
import { newUuidV7 } from '../../utils/ids';
import { LOCATION_STALE_MS } from './constants';

// Foundation service for private-group location sharing. This layer does
// NOT transmit anything — it decides, locally, whether a member's most
// recent GPS row is *allowed* to be shared with a specific group and what
// state to show the user. A future transport reads the projection.
//
// Privacy invariants (D-023, CLAUDE.md §13 §15 §20):
//   - Nothing here exposes another member's coordinates.
//   - A user must be an active member of the group AND have explicitly
//     enabled sharing for that group before a `shareable` projection is
//     produced.
//   - Disabling sharing must immediately stop producing `shareable`.
//   - Leaving / being removed from the group must immediately stop
//     producing `shareable`, even if the persisted `enabled` bit is still
//     set (a rejoin will surface the pre-existing state).

export type GroupLocationSharingErrorCode =
  | 'NOT_A_MEMBER'
  | 'GROUP_NOT_FOUND';

export class GroupLocationSharingError extends Error {
  readonly code: GroupLocationSharingErrorCode;
  constructor(code: GroupLocationSharingErrorCode, message: string) {
    super(message);
    this.name = 'GroupLocationSharingError';
    this.code = code;
  }
}

export interface EnableSharingInput {
  readonly groupId: GroupId;
  readonly userId: UserId;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
}

export interface DisableSharingInput {
  readonly groupId: GroupId;
  readonly userId: UserId;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
}

export interface ReadSharingContext {
  readonly groupId: GroupId;
  readonly userId: UserId;
  readonly now?: () => number;
}

// Composite view for the "my own" group-detail screen. Combines the
// authorization bit (`sharing`) with the freshness of the latest local fix
// (`location`). "unavailable" here means "no local location row exists at
// all"; a runtime failure to acquire a fix is separately surfaced by
// `useLocationStore`.
export type GroupLocationSharingView =
  | { sharing: 'disabled' }
  | { sharing: 'enabled'; location: 'unavailable' }
  | {
      sharing: 'enabled';
      location: 'stale';
      latest: LocationEntity;
      ageMs: number;
    }
  | {
      sharing: 'enabled';
      location: 'current';
      latest: LocationEntity;
      ageMs: number;
    };

// The projection is what a future communication transport consumes. It
// deliberately produces `shareable` only when every privacy precondition
// is met, and marks freshness so the transport / peer UI never claims a
// stale coordinate is "current" (CLAUDE.md §20).
export type GroupLocationProjection =
  | { status: 'not-a-member'; groupId: GroupId; userId: UserId }
  | { status: 'sharing-disabled'; groupId: GroupId; userId: UserId }
  | { status: 'location-unavailable'; groupId: GroupId; userId: UserId }
  | {
      status: 'shareable';
      groupId: GroupId;
      userId: UserId;
      location: LocationEntity;
      ageMs: number;
      freshness: 'current' | 'stale';
    };

export function enableGroupLocationSharing(
  db: OffgridDb,
  input: EnableSharingInput,
): void {
  requireActiveMembership(db, input.groupId, input.userId);
  const nowIso = (input.nowIso ?? (() => new Date().toISOString()))();
  const generateId = input.generateId ?? newUuidV7;
  const existing = GroupLocationSharingRepo.findSharing(
    db,
    input.groupId,
    input.userId,
  );
  GroupLocationSharingRepo.upsertSharing(db, {
    id: existing?.id ?? (generateId() as GroupLocationSharingId),
    groupId: input.groupId,
    userId: input.userId,
    enabled: true,
    nowIso,
  });
}

export function disableGroupLocationSharing(
  db: OffgridDb,
  input: DisableSharingInput,
): void {
  // Disable does NOT require active membership: a user who has just left
  // or been removed should still be able to clear their local opt-in flag
  // (defensive privacy). If the group is gone (cascade deleted), do
  // nothing.
  if (!GroupRepo.findGroupById(db, input.groupId)) {
    return;
  }
  const nowIso = (input.nowIso ?? (() => new Date().toISOString()))();
  const generateId = input.generateId ?? newUuidV7;
  const existing = GroupLocationSharingRepo.findSharing(
    db,
    input.groupId,
    input.userId,
  );
  GroupLocationSharingRepo.upsertSharing(db, {
    id: existing?.id ?? (generateId() as GroupLocationSharingId),
    groupId: input.groupId,
    userId: input.userId,
    enabled: false,
    nowIso,
  });
}

export function isGroupLocationSharingEnabled(
  db: OffgridDb,
  groupId: GroupId,
  userId: UserId,
): boolean {
  const row = GroupLocationSharingRepo.findSharing(db, groupId, userId);
  return row?.enabled === true;
}

// Own-view: the group screen renders exactly this. Callers must have
// already verified the caller is looking at their own state.
export function getMyGroupLocationSharingView(
  db: OffgridDb,
  ctx: ReadSharingContext,
): GroupLocationSharingView {
  if (!isGroupLocationSharingEnabled(db, ctx.groupId, ctx.userId)) {
    return { sharing: 'disabled' };
  }
  const latest = LocationRepo.findLatestForUser(db, ctx.userId);
  if (!latest) {
    return { sharing: 'enabled', location: 'unavailable' };
  }
  const nowMs = (ctx.now ?? Date.now)();
  const ageMs = Math.max(0, nowMs - Date.parse(latest.createdAt));
  if (ageMs > LOCATION_STALE_MS) {
    return { sharing: 'enabled', location: 'stale', latest, ageMs };
  }
  return { sharing: 'enabled', location: 'current', latest, ageMs };
}

// Transport-facing projection. Never leaks coordinates unless every gate
// passes.
export function prepareGroupLocationProjection(
  db: OffgridDb,
  ctx: ReadSharingContext,
): GroupLocationProjection {
  const membership = GroupMemberRepo.findMembership(db, ctx.groupId, ctx.userId);
  if (!membership || membership.status !== 'active') {
    return { status: 'not-a-member', groupId: ctx.groupId, userId: ctx.userId };
  }
  if (!isGroupLocationSharingEnabled(db, ctx.groupId, ctx.userId)) {
    return {
      status: 'sharing-disabled',
      groupId: ctx.groupId,
      userId: ctx.userId,
    };
  }
  const latest = LocationRepo.findLatestForUser(db, ctx.userId);
  if (!latest) {
    return {
      status: 'location-unavailable',
      groupId: ctx.groupId,
      userId: ctx.userId,
    };
  }
  const nowMs = (ctx.now ?? Date.now)();
  const ageMs = Math.max(0, nowMs - Date.parse(latest.createdAt));
  const freshness: 'current' | 'stale' =
    ageMs > LOCATION_STALE_MS ? 'stale' : 'current';
  return {
    status: 'shareable',
    groupId: ctx.groupId,
    userId: ctx.userId,
    location: latest,
    ageMs,
    freshness,
  };
}

function requireActiveMembership(
  db: OffgridDb,
  groupId: GroupId,
  userId: UserId,
): void {
  if (!GroupRepo.findGroupById(db, groupId)) {
    throw new GroupLocationSharingError(
      'GROUP_NOT_FOUND',
      'Group not found.',
    );
  }
  const membership = GroupMemberRepo.findMembership(db, groupId, userId);
  if (!membership || membership.status !== 'active') {
    throw new GroupLocationSharingError(
      'NOT_A_MEMBER',
      'Only active group members can enable location sharing.',
    );
  }
}
