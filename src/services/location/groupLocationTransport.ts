import type { OffgridDb } from '../../database';
import {
  GroupMemberRepo,
  GroupRepo,
  LocationRepo,
} from '../../database/repositories';
import type {
  GroupLocationBody,
  MessageEnvelope,
} from '../../types/communication';
import type { Location as LocationEntity } from '../../types/entities';
import type {
  DeviceId,
  GroupId,
  LocationId,
  UserId,
} from '../../types/ids';
import { ensureRemoteDeviceRow } from '../communication/testGroup';
import {
  getCurrentLocation,
  type LocationReadResult,
  type LocationServiceContext,
  type RequestLocationOptions,
} from './locationService';
import {
  isGroupLocationSharingEnabled,
  prepareGroupLocationProjection,
} from './groupSharing';

// Milestone B V0 direct group location transmission.
//
//   sender:   GPS → validate membership + sharing → build envelope body →
//             hand off to the CommunicationManager (hopCount=0, ttl=0).
//   receiver: codec-validated envelope → verify group + sender membership
//             locally → dedupe by locationId → persist with source='peer'.
//
// This service is transport-agnostic. The sender takes a callback so tests
// (and future transports) can plug in without instantiating
// CommunicationManager or WifiP2pTransport (D-013 §5).
//
// Privacy invariants (CLAUDE.md §13 §15 §20; D-023):
//   - The sender NEVER transmits when membership or sharing gates fail.
//   - The receiver NEVER persists a peer coordinate unless the sender is a
//     known active member of the group on this device. Absence of a
//     matching group locally rejects the envelope.
//   - Coordinates are never fabricated or backfilled — a failed GPS read
//     surfaces `no-fix` and no envelope is sent.

export type SendGroupLocationOutcome =
  | {
      status: 'sent';
      envelope: MessageEnvelope;
      location: LocationEntity;
    }
  | { status: 'not-a-member'; groupId: GroupId; userId: UserId }
  | { status: 'sharing-disabled'; groupId: GroupId; userId: UserId }
  | {
      status: 'no-fix';
      reason: LocationReadResult;
    }
  | { status: 'transport-error'; error: Error };

export interface SendGroupLocationInput {
  readonly db: OffgridDb;
  readonly groupId: GroupId;
  readonly userId: UserId;
  readonly deviceId: DeviceId | null;
  readonly sendEnvelope: (
    body: GroupLocationBody,
  ) => Promise<MessageEnvelope>;
  readonly locationOptions?: RequestLocationOptions;
  readonly nowIso?: () => string;
  readonly generateId?: () => string;
  readonly now?: () => number;
}

export async function sendGroupLocation(
  input: SendGroupLocationInput,
): Promise<SendGroupLocationOutcome> {
  // Cheap authorization checks first — no GPS request if we're not
  // authorized to broadcast in the first place.
  const membership = GroupMemberRepo.findMembership(
    input.db,
    input.groupId,
    input.userId,
  );
  if (!membership || membership.status !== 'active') {
    return {
      status: 'not-a-member',
      groupId: input.groupId,
      userId: input.userId,
    };
  }
  if (
    !isGroupLocationSharingEnabled(input.db, input.groupId, input.userId)
  ) {
    return {
      status: 'sharing-disabled',
      groupId: input.groupId,
      userId: input.userId,
    };
  }

  const ctx: LocationServiceContext = {
    db: input.db,
    userId: input.userId,
    deviceId: input.deviceId ?? null,
    ...(input.nowIso ? { nowIso: input.nowIso } : {}),
    ...(input.generateId ? { generateId: input.generateId } : {}),
    ...(input.now ? { now: input.now } : {}),
  };
  const read = await getCurrentLocation(ctx, input.locationOptions);
  if (read.status !== 'ok' && read.status !== 'stale') {
    return { status: 'no-fix', reason: read };
  }
  // Re-check the projection with the fresh row in place. This closes a
  // TOCTOU window: if sharing was flipped off between the initial
  // authorization check and the GPS fix, we abort *before* transmitting.
  const projection = prepareGroupLocationProjection(input.db, {
    groupId: input.groupId,
    userId: input.userId,
    ...(input.now ? { now: input.now } : {}),
  });
  if (projection.status !== 'shareable') {
    if (projection.status === 'sharing-disabled') {
      return {
        status: 'sharing-disabled',
        groupId: input.groupId,
        userId: input.userId,
      };
    }
    if (projection.status === 'not-a-member') {
      return {
        status: 'not-a-member',
        groupId: input.groupId,
        userId: input.userId,
      };
    }
    return { status: 'no-fix', reason: read };
  }

  const location = read.location;
  const body: GroupLocationBody = {
    kind: 'group.location',
    payload: {
      groupId: input.groupId,
      senderUserId: input.userId,
      locationId: location.id,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      altitude: location.altitude,
      heading: location.heading,
      speed: location.speed,
      capturedAt: location.createdAt,
    },
  };

  let envelope: MessageEnvelope;
  try {
    envelope = await input.sendEnvelope(body);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { status: 'transport-error', error };
  }
  return { status: 'sent', envelope, location };
}

export type ReceiveGroupLocationOutcome =
  | { status: 'accepted'; location: LocationEntity }
  | { status: 'duplicate'; location: LocationEntity }
  | { status: 'group-not-found' }
  | { status: 'not-a-member' }
  | { status: 'invalid'; reason: string };

export interface ReceiveGroupLocationInput {
  readonly db: OffgridDb;
  readonly envelope: MessageEnvelope;
  readonly nowIso?: () => string;
}

export function receiveGroupLocationEnvelope(
  input: ReceiveGroupLocationInput,
): ReceiveGroupLocationOutcome {
  const { envelope } = input;
  if (envelope.body.kind !== 'group.location') {
    return { status: 'invalid', reason: 'wrong-envelope-kind' };
  }
  const payload = envelope.body.payload;
  const nowIso = (input.nowIso ?? (() => new Date().toISOString()))();

  // Belt-and-suspenders: the codec already enforces envelope-level
  // constraints, but a rogue caller could construct an envelope in memory.
  // Reject anything that would let a peer relay silently proxy this
  // location as their own.
  if (envelope.hopCount !== 0) {
    return { status: 'invalid', reason: 'hop-count-nonzero' };
  }
  if (envelope.originDeviceId === null) {
    return { status: 'invalid', reason: 'missing-origin-device' };
  }
  // Envelope.id and payload.locationId must match — that is our dedup key
  // and the identity we persist. A mismatch means the envelope was
  // tampered with.
  if ((envelope.id as unknown as string) !== (payload.locationId as unknown as string)) {
    return { status: 'invalid', reason: 'envelope-id-mismatch' };
  }

  if (!GroupRepo.findGroupById(input.db, payload.groupId)) {
    return { status: 'group-not-found' };
  }
  const membership = GroupMemberRepo.findMembership(
    input.db,
    payload.groupId,
    payload.senderUserId,
  );
  if (!membership || membership.status !== 'active') {
    return { status: 'not-a-member' };
  }

  ensureRemoteDeviceRow(input.db, envelope.originDeviceId, nowIso);

  const { location, inserted } = LocationRepo.insertLocationIfAbsent(input.db, {
    id: payload.locationId as LocationId,
    userId: payload.senderUserId,
    deviceId: envelope.originDeviceId,
    groupId: payload.groupId,
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracy: payload.accuracy,
    altitude: payload.altitude,
    heading: payload.heading,
    speed: payload.speed,
    source: 'peer',
    createdAt: payload.capturedAt,
    syncStatus: 'NOT_SYNCED',
  });
  return inserted
    ? { status: 'accepted', location }
    : { status: 'duplicate', location };
}
