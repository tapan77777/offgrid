import type { OffgridDb } from '../../database';
import {
  GroupMemberRepo,
  GroupRepo,
  LocationRepo,
} from '../../database/repositories';
import type {
  GroupMember,
  GroupMemberRole,
  Location as LocationEntity,
} from '../../types/entities';
import type { GroupId, UserId } from '../../types/ids';
import { LOCATION_STALE_MS } from './constants';
import { isGroupLocationSharingEnabled } from './groupSharing';

// Group Map view-model. Turns the local database into an authorized,
// freshness-aware set of markers for the group map screen.
//
// Privacy invariants (D-023, CLAUDE.md §13 §15 §20):
//   - The viewer must be an active member of the group. Anything else
//     collapses to `not-a-member` — no coordinates leak.
//   - Only peers who are locally known to be active members of *this*
//     group appear on the map. Members with no received peer row appear
//     as `no-location` (never as fabricated coordinates).
//   - The viewer's own marker is drawn from the latest GPS row *only if*
//     they have explicitly enabled location sharing for this group. This
//     matches the on-wire authorization (see prepareGroupLocationProjection):
//     what the viewer sees for themselves is what a peer would see if a
//     transport were live.
//   - Coordinates are validated (finite, in-range) before being surfaced.
//     An invalid stored row collapses to `no-location` rather than
//     rendering off-map or crashing the projection.
//   - Freshness uses LOCATION_STALE_MS. A row past the threshold becomes
//     `shareable-stale`; the UI labels it "Last known", never "Current"
//     (D-023, docs/06-UX-FLOWS.md §18).

export type GroupMapMemberStatus =
  | {
      kind: 'shareable-current';
      location: LocationEntity;
      ageMs: number;
    }
  | {
      kind: 'shareable-stale';
      location: LocationEntity;
      ageMs: number;
    }
  | { kind: 'sharing-disabled' }
  | { kind: 'no-location' };

export interface GroupMapMember {
  readonly userId: UserId;
  readonly role: GroupMemberRole;
  readonly isSelf: boolean;
  readonly status: GroupMapMemberStatus;
}

export type GroupMapView =
  | { status: 'group-not-found'; groupId: GroupId }
  | { status: 'not-a-member'; groupId: GroupId; viewerUserId: UserId }
  | {
      status: 'ok';
      groupId: GroupId;
      viewerUserId: UserId;
      members: GroupMapMember[];
      visibleCount: number;
    };

export interface PrepareGroupMapViewInput {
  readonly groupId: GroupId;
  readonly viewerUserId: UserId;
  readonly now?: () => number;
}

export function prepareGroupMapView(
  db: OffgridDb,
  input: PrepareGroupMapViewInput,
): GroupMapView {
  if (!GroupRepo.findGroupById(db, input.groupId)) {
    return { status: 'group-not-found', groupId: input.groupId };
  }
  const viewerMembership = GroupMemberRepo.findMembership(
    db,
    input.groupId,
    input.viewerUserId,
  );
  if (!viewerMembership || viewerMembership.status !== 'active') {
    return {
      status: 'not-a-member',
      groupId: input.groupId,
      viewerUserId: input.viewerUserId,
    };
  }

  const nowMs = (input.now ?? Date.now)();
  const activeMembers = GroupMemberRepo.listActiveMembersForGroup(
    db,
    input.groupId,
  );
  const members: GroupMapMember[] = activeMembers.map(m =>
    projectMember(db, input.groupId, m, input.viewerUserId, nowMs),
  );
  const visibleCount = members.filter(
    m => m.status.kind === 'shareable-current' || m.status.kind === 'shareable-stale',
  ).length;
  return {
    status: 'ok',
    groupId: input.groupId,
    viewerUserId: input.viewerUserId,
    members,
    visibleCount,
  };
}

function projectMember(
  db: OffgridDb,
  groupId: GroupId,
  member: GroupMember,
  viewerUserId: UserId,
  nowMs: number,
): GroupMapMember {
  const isSelf = member.userId === viewerUserId;
  if (isSelf) {
    return {
      userId: member.userId,
      role: member.role,
      isSelf: true,
      status: projectSelfStatus(db, groupId, member.userId, nowMs),
    };
  }
  return {
    userId: member.userId,
    role: member.role,
    isSelf: false,
    status: projectPeerStatus(db, groupId, member.userId, nowMs),
  };
}

function projectSelfStatus(
  db: OffgridDb,
  groupId: GroupId,
  userId: UserId,
  nowMs: number,
): GroupMapMemberStatus {
  if (!isGroupLocationSharingEnabled(db, groupId, userId)) {
    return { kind: 'sharing-disabled' };
  }
  const latest = LocationRepo.findLatestForUser(db, userId);
  if (!latest || !hasValidCoordinates(latest)) {
    return { kind: 'no-location' };
  }
  return classifyFreshness(latest, nowMs);
}

function projectPeerStatus(
  db: OffgridDb,
  groupId: GroupId,
  userId: UserId,
  nowMs: number,
): GroupMapMemberStatus {
  const latest = LocationRepo.findLatestPeerLocationForGroup(
    db,
    groupId,
    userId,
  );
  if (!latest || !hasValidCoordinates(latest)) {
    return { kind: 'no-location' };
  }
  return classifyFreshness(latest, nowMs);
}

function classifyFreshness(
  location: LocationEntity,
  nowMs: number,
): GroupMapMemberStatus {
  const ageMs = Math.max(0, nowMs - Date.parse(location.createdAt));
  if (!Number.isFinite(ageMs)) {
    return { kind: 'no-location' };
  }
  if (ageMs > LOCATION_STALE_MS) {
    return { kind: 'shareable-stale', location, ageMs };
  }
  return { kind: 'shareable-current', location, ageMs };
}

function hasValidCoordinates(location: LocationEntity): boolean {
  return (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    location.longitude >= -180 &&
    location.longitude <= 180
  );
}
