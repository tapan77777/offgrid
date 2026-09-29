import { createInMemoryDb } from '../../support/testDb';
import {
  findDeviceById,
  findLinkedByDeviceAddress,
  findLinkedByUserId,
  insertDevice,
  listLinked,
  markLinked,
  unlink,
  updateLastKnownDeviceAddress,
} from '../../../src/database/repositories/deviceRepository';
import { insertUser } from '../../../src/database/repositories/userRepository';
import { newUuidV7 } from '../../../src/utils/ids';
import type { DeviceId, UserId } from '../../../src/types/ids';

// D-078 linked-peer helpers on DeviceRepo.
describe('deviceRepository — linked peers (D-078)', () => {
  const NOW = '2026-01-01T00:00:00.000Z';
  const LATER = '2026-01-02T00:00:00.000Z';

  function mkUser(db: ReturnType<typeof createInMemoryDb>): UserId {
    const id = newUuidV7() as UserId;
    insertUser(db, { id, displayName: 'peer', nowIso: NOW });
    return id;
  }

  it('marks an existing device as linked without clobbering created_at', () => {
    const db = createInMemoryDb();
    const deviceId = newUuidV7() as DeviceId;
    insertDevice(db, {
      id: deviceId,
      platform: 'android',
      nowIso: NOW,
    });
    const userId = mkUser(db);
    const linked = markLinked(db, {
      deviceId,
      linkedUserId: userId,
      lastKnownDeviceAddress: '02:11:22:33:44:55',
      nowIso: LATER,
    });
    expect(linked.linkedUserId).toBe(userId);
    expect(linked.linkedAt).toBe(LATER);
    expect(linked.lastKnownDeviceAddress).toBe('02:11:22:33:44:55');
    expect(linked.createdAt).toBe(NOW);
    expect(linked.lastSeenAt).toBe(LATER);
    db.close();
  });

  it('materialises a device row if the device has never been seen', () => {
    const db = createInMemoryDb();
    const deviceId = newUuidV7() as DeviceId;
    const userId = mkUser(db);
    const linked = markLinked(db, {
      deviceId,
      linkedUserId: userId,
      nowIso: NOW,
    });
    expect(linked.id).toBe(deviceId);
    expect(linked.linkedUserId).toBe(userId);
    expect(linked.linkedAt).toBe(NOW);
    expect(linked.lastKnownDeviceAddress).toBeNull();
    db.close();
  });

  it('preserves linked_at across re-link', () => {
    const db = createInMemoryDb();
    const deviceId = newUuidV7() as DeviceId;
    const userId = mkUser(db);
    markLinked(db, {
      deviceId,
      linkedUserId: userId,
      nowIso: NOW,
    });
    const relinked = markLinked(db, {
      deviceId,
      linkedUserId: userId,
      nowIso: LATER,
    });
    expect(relinked.linkedAt).toBe(NOW);
    expect(relinked.lastSeenAt).toBe(LATER);
    db.close();
  });

  it('unlink() clears linked_user_id and linked_at without deleting the row', () => {
    const db = createInMemoryDb();
    const deviceId = newUuidV7() as DeviceId;
    const userId = mkUser(db);
    markLinked(db, {
      deviceId,
      linkedUserId: userId,
      nowIso: NOW,
    });
    unlink(db, deviceId);
    const row = findDeviceById(db, deviceId);
    expect(row).not.toBeNull();
    expect(row?.linkedUserId).toBeNull();
    expect(row?.linkedAt).toBeNull();
    db.close();
  });

  it('listLinked returns only rows with a non-null linked_user_id, most recent first', () => {
    const db = createInMemoryDb();
    const userA = mkUser(db);
    const userB = mkUser(db);
    const deviceA = newUuidV7() as DeviceId;
    const deviceB = newUuidV7() as DeviceId;
    insertDevice(db, { id: deviceA, platform: 'android', nowIso: NOW });
    insertDevice(db, { id: deviceB, platform: 'android', nowIso: NOW });
    markLinked(db, { deviceId: deviceA, linkedUserId: userA, nowIso: NOW });
    markLinked(db, {
      deviceId: deviceB,
      linkedUserId: userB,
      nowIso: LATER,
    });
    const list = listLinked(db);
    expect(list.map(d => d.id)).toEqual([deviceB, deviceA]);
    db.close();
  });

  it('findLinkedByDeviceAddress locates the linked row', () => {
    const db = createInMemoryDb();
    const deviceId = newUuidV7() as DeviceId;
    const userId = mkUser(db);
    markLinked(db, {
      deviceId,
      linkedUserId: userId,
      lastKnownDeviceAddress: 'AA:BB:CC:DD:EE:FF',
      nowIso: NOW,
    });
    const found = findLinkedByDeviceAddress(db, 'AA:BB:CC:DD:EE:FF');
    expect(found?.id).toBe(deviceId);
    expect(findLinkedByDeviceAddress(db, 'nope')).toBeNull();
    db.close();
  });

  it('findLinkedByUserId returns the most recently linked device for that user', () => {
    const db = createInMemoryDb();
    const userId = mkUser(db);
    const oldDevice = newUuidV7() as DeviceId;
    const newDevice = newUuidV7() as DeviceId;
    markLinked(db, { deviceId: oldDevice, linkedUserId: userId, nowIso: NOW });
    markLinked(db, {
      deviceId: newDevice,
      linkedUserId: userId,
      nowIso: LATER,
    });
    const found = findLinkedByUserId(db, userId);
    expect(found?.id).toBe(newDevice);
    db.close();
  });

  it('updateLastKnownDeviceAddress mutates only the address column', () => {
    const db = createInMemoryDb();
    const deviceId = newUuidV7() as DeviceId;
    const userId = mkUser(db);
    markLinked(db, {
      deviceId,
      linkedUserId: userId,
      lastKnownDeviceAddress: '11:11:11:11:11:11',
      nowIso: NOW,
    });
    updateLastKnownDeviceAddress(db, deviceId, '22:22:22:22:22:22');
    const row = findDeviceById(db, deviceId);
    expect(row?.lastKnownDeviceAddress).toBe('22:22:22:22:22:22');
    expect(row?.linkedUserId).toBe(userId);
    expect(row?.linkedAt).toBe(NOW);
    db.close();
  });
});
