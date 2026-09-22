import { createInMemoryDb } from '../../support/testDb';
import {
  DeviceRepo,
  GroupMemberRepo,
  GroupRepo,
  LocationRepo,
  UserRepo,
} from '../../../src/database/repositories';
import {
  LOCATION_STALE_MS,
  enableGroupLocationSharing,
  prepareGroupMapView,
} from '../../../src/services/location';
import { newUuidV7 } from '../../../src/utils/ids';
import type {
  DeviceId,
  GroupId,
  GroupMemberId,
  LocationId,
  UserId,
} from '../../../src/types/ids';

// Group Map projection tests. These exercise the pure view-model that the
// GroupMapScreen renders. All assertions cover privacy invariants
// (D-023, CLAUDE.md §13 §15 §20) and honest UX for freshness
// (LOCATION_STALE_MS boundary).

const NOW_ISO = '2026-05-01T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);
const now = (): number => NOW_MS;

interface Rig {
  db: ReturnType<typeof createInMemoryDb>;
  viewer: UserId;
  peer: UserId;
  outsider: UserId;
  groupId: GroupId;
  otherGroupId: GroupId;
  viewerDevice: DeviceId;
  peerDevice: DeviceId;
  close(): void;
}

function seedRig(): Rig {
  const db = createInMemoryDb();
  const viewer = newUuidV7() as UserId;
  const peer = newUuidV7() as UserId;
  const outsider = newUuidV7() as UserId;
  const groupId = newUuidV7() as GroupId;
  const otherGroupId = newUuidV7() as GroupId;
  const viewerDevice = newUuidV7() as DeviceId;
  const peerDevice = newUuidV7() as DeviceId;

  UserRepo.insertUser(db, {
    id: viewer,
    displayName: 'Viewer',
    nowIso: NOW_ISO,
  });
  UserRepo.insertUser(db, { id: peer, displayName: 'Peer', nowIso: NOW_ISO });
  UserRepo.insertUser(db, {
    id: outsider,
    displayName: 'Outsider',
    nowIso: NOW_ISO,
  });
  DeviceRepo.insertDevice(db, {
    id: viewerDevice,
    userId: viewer,
    platform: 'android',
    nowIso: NOW_ISO,
  });
  DeviceRepo.insertDevice(db, {
    id: peerDevice,
    userId: peer,
    platform: 'android',
    nowIso: NOW_ISO,
  });
  GroupRepo.insertGroup(db, {
    id: groupId,
    name: 'Alps',
    createdBy: viewer,
    nowIso: NOW_ISO,
  });
  GroupRepo.insertGroup(db, {
    id: otherGroupId,
    name: 'Andes',
    createdBy: outsider,
    nowIso: NOW_ISO,
  });
  GroupMemberRepo.insertGroupMember(db, {
    id: newUuidV7() as GroupMemberId,
    groupId,
    userId: viewer,
    role: 'admin',
    nowIso: NOW_ISO,
  });
  GroupMemberRepo.insertGroupMember(db, {
    id: newUuidV7() as GroupMemberId,
    groupId,
    userId: peer,
    role: 'member',
    nowIso: NOW_ISO,
  });

  return {
    db,
    viewer,
    peer,
    outsider,
    groupId,
    otherGroupId,
    viewerDevice,
    peerDevice,
    close: () => db.close(),
  };
}

function insertGpsFix(
  rig: Rig,
  userId: UserId,
  deviceId: DeviceId,
  ageMs: number,
  coords: { latitude: number; longitude: number } = {
    latitude: 46.5,
    longitude: 6.6,
  },
): void {
  LocationRepo.insertLocation(rig.db, {
    id: newUuidV7() as LocationId,
    userId,
    deviceId,
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: 5,
    source: 'gps',
    createdAt: new Date(NOW_MS - ageMs).toISOString(),
  });
}

function insertPeerRow(
  rig: Rig,
  fromUserId: UserId,
  fromDeviceId: DeviceId,
  groupId: GroupId,
  ageMs: number,
  coords: { latitude: number; longitude: number } = {
    latitude: 46.6,
    longitude: 6.7,
  },
): void {
  LocationRepo.insertLocation(rig.db, {
    id: newUuidV7() as LocationId,
    userId: fromUserId,
    deviceId: fromDeviceId,
    groupId,
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: 8,
    source: 'peer',
    createdAt: new Date(NOW_MS - ageMs).toISOString(),
  });
}

describe('prepareGroupMapView (Group Map projection)', () => {
  it('scenario 1 — group not found returns group-not-found (no coordinate leak)', () => {
    const rig = seedRig();
    const bogusGroup = newUuidV7() as GroupId;
    const view = prepareGroupMapView(rig.db, {
      groupId: bogusGroup,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('group-not-found');
    rig.close();
  });

  it('scenario 2 — viewer is not a member returns not-a-member (no coordinates)', () => {
    const rig = seedRig();
    // viewer is not a member of otherGroupId.
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.otherGroupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('not-a-member');
    if (view.status === 'not-a-member') {
      expect(view.viewerUserId).toBe(rig.viewer);
    }
    rig.close();
  });

  it('scenario 3 — self is sharing-disabled by default even with a valid local GPS row', () => {
    const rig = seedRig();
    insertGpsFix(rig, rig.viewer, rig.viewerDevice, 5_000);
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      const self = view.members.find(m => m.isSelf);
      expect(self?.status.kind).toBe('sharing-disabled');
      // No coordinates should be surfaced for the self marker in this state.
      expect(self?.status.kind === 'sharing-disabled').toBe(true);
      expect(view.visibleCount).toBe(0);
    }
    rig.close();
  });

  it('scenario 4 — self appears as shareable-current when sharing enabled and fix is fresh', () => {
    const rig = seedRig();
    enableGroupLocationSharing(rig.db, {
      groupId: rig.groupId,
      userId: rig.viewer,
      nowIso: () => NOW_ISO,
    });
    insertGpsFix(rig, rig.viewer, rig.viewerDevice, 5_000, {
      latitude: 46.5,
      longitude: 6.6,
    });
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      const self = view.members.find(m => m.isSelf);
      expect(self?.status.kind).toBe('shareable-current');
      if (self && self.status.kind === 'shareable-current') {
        expect(self.status.location.latitude).toBeCloseTo(46.5);
        expect(self.status.location.longitude).toBeCloseTo(6.6);
        expect(self.status.ageMs).toBeGreaterThanOrEqual(4_000);
        expect(self.status.location.source).toBe('gps');
      }
    }
    rig.close();
  });

  it('scenario 5 — self flips to shareable-stale past LOCATION_STALE_MS', () => {
    const rig = seedRig();
    enableGroupLocationSharing(rig.db, {
      groupId: rig.groupId,
      userId: rig.viewer,
      nowIso: () => NOW_ISO,
    });
    insertGpsFix(rig, rig.viewer, rig.viewerDevice, LOCATION_STALE_MS + 1_000);
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      const self = view.members.find(m => m.isSelf);
      expect(self?.status.kind).toBe('shareable-stale');
    }
    rig.close();
  });

  it('scenario 6 — peer with a received row appears with peer coordinates', () => {
    const rig = seedRig();
    insertPeerRow(rig, rig.peer, rig.peerDevice, rig.groupId, 3_000, {
      latitude: 46.61,
      longitude: 6.71,
    });
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      const peer = view.members.find(m => m.userId === rig.peer);
      expect(peer?.isSelf).toBe(false);
      expect(peer?.status.kind).toBe('shareable-current');
      if (peer && peer.status.kind === 'shareable-current') {
        expect(peer.status.location.source).toBe('peer');
        expect(peer.status.location.latitude).toBeCloseTo(46.61);
      }
    }
    rig.close();
  });

  it('scenario 7 — peer with a stale received row appears as shareable-stale (last known)', () => {
    const rig = seedRig();
    insertPeerRow(
      rig,
      rig.peer,
      rig.peerDevice,
      rig.groupId,
      LOCATION_STALE_MS + 5_000,
    );
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      const peer = view.members.find(m => m.userId === rig.peer);
      expect(peer?.status.kind).toBe('shareable-stale');
    }
    rig.close();
  });

  it('scenario 8 — peer with no received row appears as no-location (no fabricated coords)', () => {
    const rig = seedRig();
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      const peer = view.members.find(m => m.userId === rig.peer);
      expect(peer?.status.kind).toBe('no-location');
      // Whole projection has zero visible markers → nothing was invented.
      expect(view.visibleCount).toBe(0);
    }
    rig.close();
  });

  it('scenario 9 — peer rows scoped to another group are ignored (never leak across groups)', () => {
    const rig = seedRig();
    // Peer has a row for a *different* group. Even though we know peer's
    // user_id, we must not surface it on Alps.
    insertPeerRow(rig, rig.peer, rig.peerDevice, rig.otherGroupId, 3_000, {
      latitude: 10,
      longitude: 20,
    });
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      const peer = view.members.find(m => m.userId === rig.peer);
      expect(peer?.status.kind).toBe('no-location');
    }
    rig.close();
  });

  it('scenario 10 — the viewer\'s own GPS row is never surfaced as another member\'s peer location', () => {
    const rig = seedRig();
    // Only viewer has a fix. Sharing NOT enabled. Peer marker must stay
    // no-location — the viewer's gps row must never bleed into another
    // member's slot.
    insertGpsFix(rig, rig.viewer, rig.viewerDevice, 5_000);
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      const peer = view.members.find(m => m.userId === rig.peer);
      expect(peer?.status.kind).toBe('no-location');
      const self = view.members.find(m => m.isSelf);
      expect(self?.status.kind).toBe('sharing-disabled');
    }
    rig.close();
  });

  it('scenario 11 — an outsider (never a member) does not appear on the map, even if a row exists', () => {
    const rig = seedRig();
    // Insert a peer row for an outsider bound to *this* group. This could
    // happen if a malicious/misconfigured envelope somehow got through the
    // transport gate — the projection must still not render them.
    insertPeerRow(rig, rig.outsider, rig.peerDevice, rig.groupId, 3_000);
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      expect(view.members.some(m => m.userId === rig.outsider)).toBe(false);
    }
    rig.close();
  });

  it('scenario 12 — invalid stored coordinates are downgraded to no-location', () => {
    const rig = seedRig();
    enableGroupLocationSharing(rig.db, {
      groupId: rig.groupId,
      userId: rig.viewer,
      nowIso: () => NOW_ISO,
    });
    // Bypass insertLocation validation by writing directly.
    rig.db.execute(
      `INSERT INTO locations
         (id, user_id, device_id, group_id, latitude, longitude,
          accuracy, altitude, heading, speed, source, created_at,
          expires_at, sync_status)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, 'gps', ?, NULL, 'NOT_SYNCED')`,
      [
        newUuidV7() as LocationId,
        rig.viewer,
        rig.viewerDevice,
        1_000, // out-of-range latitude
        6.6,
        new Date(NOW_MS - 1_000).toISOString(),
      ],
    );
    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      const self = view.members.find(m => m.isSelf);
      expect(self?.status.kind).toBe('no-location');
    }
    rig.close();
  });

  it('scenario 13 — visibleCount counts both current and stale, ignoring no-location and sharing-disabled', () => {
    const rig = seedRig();
    // Add a third active member with a fresh peer row.
    const third = newUuidV7() as UserId;
    const thirdDevice = newUuidV7() as DeviceId;
    UserRepo.insertUser(rig.db, {
      id: third,
      displayName: 'Third',
      nowIso: NOW_ISO,
    });
    DeviceRepo.insertDevice(rig.db, {
      id: thirdDevice,
      userId: third,
      platform: 'android',
      nowIso: NOW_ISO,
    });
    GroupMemberRepo.insertGroupMember(rig.db, {
      id: newUuidV7() as GroupMemberId,
      groupId: rig.groupId,
      userId: third,
      role: 'member',
      nowIso: NOW_ISO,
    });
    // Self: sharing-disabled (no contribution).
    // Peer: stale (counts).
    insertPeerRow(
      rig,
      rig.peer,
      rig.peerDevice,
      rig.groupId,
      LOCATION_STALE_MS + 10_000,
    );
    // Third: fresh (counts).
    insertPeerRow(rig, third, thirdDevice, rig.groupId, 2_000);

    const view = prepareGroupMapView(rig.db, {
      groupId: rig.groupId,
      viewerUserId: rig.viewer,
      now,
    });
    expect(view.status).toBe('ok');
    if (view.status === 'ok') {
      expect(view.visibleCount).toBe(2);
      expect(view.members.length).toBe(3);
    }
    rig.close();
  });
});
