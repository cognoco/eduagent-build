jest.mock('./parking-lot' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('./parking-lot'),
  MAX_PARKING_LOT_PER_TOPIC: 10,
}));

import type { Database } from '@eduagent/database';
import {
  getParkingLotItems,
  getParkingLotItemsForTopic,
  addParkingLotItem,
} from './parking-lot-data';

const profileId = 'test-profile-id';
const sessionId = '660e8400-e29b-41d4-a716-446655440000';
const topicId = '770e8400-e29b-41d4-a716-446655440000';

const NOW = new Date('2026-02-15T10:00:00.000Z');

function mockParkingLotRow(
  overrides?: Partial<{
    id: string;
    question: string;
    explored: boolean;
    createdAt: Date;
  }>,
) {
  return {
    id: overrides?.id ?? 'item-1',
    sessionId,
    profileId,
    topicId: null,
    question: overrides?.question ?? 'Why is the sky blue?',
    explored: overrides?.explored ?? false,
    createdAt: overrides?.createdAt ?? NOW,
  };
}

function createMockDb(): Database {
  const db = {
    query: {
      parkingLotItems: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockParkingLotRow()]),
      }),
    }),
    // D-04: addParkingLotItem now wraps count+insert in a transaction.
    // [BUG-860] addParkingLotItem also issues a pg_advisory_xact_lock via
    // tx.execute(sql`...`) before the count check; mock returns void.
    transaction: jest
      .fn()
      .mockImplementation((cb: (tx: unknown) => unknown) => cb(db)),
    execute: jest.fn().mockResolvedValue(undefined),
  } as unknown as Database;
  return db;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getParkingLotItems
// ---------------------------------------------------------------------------

describe('getParkingLotItems', () => {
  it('returns empty array when no items exist', async () => {
    const db = createMockDb();
    const result = await getParkingLotItems(db, profileId, sessionId);

    expect(result.items).toEqual([]);
    expect(result.count).toBe(0);
  });

  it('returns items for a session', async () => {
    const row1 = mockParkingLotRow({ id: 'item-1', question: 'Question 1' });
    const row2 = mockParkingLotRow({
      id: 'item-2',
      question: 'Question 2',
      explored: true,
    });

    const db = createMockDb();
    (db.query.parkingLotItems.findMany as jest.Mock).mockResolvedValue([
      row1,
      row2,
    ]);

    const result = await getParkingLotItems(db, profileId, sessionId);

    expect(result.items).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.items[0]).toEqual({
      id: 'item-1',
      question: 'Question 1',
      explored: false,
      createdAt: NOW.toISOString(),
    });
    expect(result.items[1]).toEqual({
      id: 'item-2',
      question: 'Question 2',
      explored: true,
      createdAt: NOW.toISOString(),
    });
  });

  it('maps createdAt to ISO string', async () => {
    const specificDate = new Date('2026-01-20T14:30:00.000Z');
    const row = mockParkingLotRow({ createdAt: specificDate });

    const db = createMockDb();
    (db.query.parkingLotItems.findMany as jest.Mock).mockResolvedValue([row]);

    const result = await getParkingLotItems(db, profileId, sessionId);

    expect(result.items[0]!.createdAt).toBe('2026-01-20T14:30:00.000Z');
  });
});

describe('getParkingLotItemsForTopic', () => {
  it('returns items linked to a topic', async () => {
    const row = {
      ...mockParkingLotRow({ id: 'topic-item-1', question: 'Topic question' }),
      topicId,
    };
    const db = createMockDb();
    (db.query.parkingLotItems.findMany as jest.Mock).mockResolvedValue([row]);

    const result = await getParkingLotItemsForTopic(db, profileId, topicId);

    expect(result.count).toBe(1);
    expect(result.items[0]).toEqual({
      id: 'topic-item-1',
      question: 'Topic question',
      explored: false,
      createdAt: NOW.toISOString(),
    });
  });
});

// ---------------------------------------------------------------------------
// addParkingLotItem
// ---------------------------------------------------------------------------

describe('addParkingLotItem', () => {
  it('inserts a new item and returns it', async () => {
    const newRow = mockParkingLotRow({
      id: 'new-item-id',
      question: 'Why does the sky appear blue?',
    });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([newRow]),
      }),
    });

    const result = await addParkingLotItem(
      db,
      profileId,
      sessionId,
      'Why does the sky appear blue?',
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe('new-item-id');
    expect(result!.question).toBe('Why does the sky appear blue?');
    expect(result!.explored).toBe(false);
    expect(db.insert).toHaveBeenCalled();
  });

  it('passes topicId when provided', async () => {
    const newRow = mockParkingLotRow();
    const db = createMockDb();
    const mockValues = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([newRow]),
    });
    (db.insert as jest.Mock).mockReturnValue({
      values: mockValues,
    });

    await addParkingLotItem(db, profileId, sessionId, 'Some question', topicId);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ topicId }),
    );
  });

  it('passes null topicId when not provided', async () => {
    const newRow = mockParkingLotRow();
    const db = createMockDb();
    const mockValues = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([newRow]),
    });
    (db.insert as jest.Mock).mockReturnValue({
      values: mockValues,
    });

    await addParkingLotItem(db, profileId, sessionId, 'Some question');

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ topicId: null }),
    );
  });

  it('returns null when limit (10) is reached', async () => {
    const existingRows = Array.from({ length: 10 }, (_, i) =>
      mockParkingLotRow({ id: `item-${i}`, question: `Question ${i}` }),
    );

    const db = createMockDb();
    (db.query.parkingLotItems.findMany as jest.Mock).mockResolvedValue(
      existingRows,
    );

    const result = await addParkingLotItem(
      db,
      profileId,
      sessionId,
      'One too many',
    );

    expect(result).toBeNull();
  });

  it('enforces the limit per topic when topicId is provided', async () => {
    const existingRows = Array.from({ length: 10 }, (_, i) => ({
      ...mockParkingLotRow({
        id: `topic-item-${i}`,
        question: `Question ${i}`,
      }),
      topicId,
    }));

    const db = createMockDb();
    (db.query.parkingLotItems.findMany as jest.Mock).mockResolvedValue(
      existingRows,
    );

    const result = await addParkingLotItem(
      db,
      profileId,
      sessionId,
      'One too many',
      topicId,
    );

    expect(result).toBeNull();
  });

  it('does not call insert when limit is reached', async () => {
    const existingRows = Array.from({ length: 10 }, (_, i) =>
      mockParkingLotRow({ id: `item-${i}`, question: `Question ${i}` }),
    );

    const db = createMockDb();
    (db.query.parkingLotItems.findMany as jest.Mock).mockResolvedValue(
      existingRows,
    );

    await addParkingLotItem(db, profileId, sessionId, 'One too many');

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('D-04: wraps count check and insert in a transaction', async () => {
    const newRow = mockParkingLotRow({
      id: 'tx-item',
      question: 'Transaction test',
    });
    const db = createMockDb();
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([newRow]),
      }),
    });

    await addParkingLotItem(db, profileId, sessionId, 'Transaction test');

    // db.transaction should be called, proving the operation is wrapped
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it('D-04: performs count check inside the transaction context', async () => {
    const existingRows = Array.from({ length: 10 }, (_, i) =>
      mockParkingLotRow({ id: `item-${i}`, question: `Question ${i}` }),
    );

    const db = createMockDb();
    (db.query.parkingLotItems.findMany as jest.Mock).mockResolvedValue(
      existingRows,
    );

    const result = await addParkingLotItem(
      db,
      profileId,
      sessionId,
      'Should be rejected',
    );

    // Count check happened inside the transaction
    expect(db.transaction).toHaveBeenCalledTimes(1);
    // And the result is null (limit reached)
    expect(result).toBeNull();
    // Insert was not called because we're over the limit
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('allows insert when count is below limit', async () => {
    const existingRows = Array.from({ length: 9 }, (_, i) =>
      mockParkingLotRow({ id: `item-${i}`, question: `Question ${i}` }),
    );
    const newRow = mockParkingLotRow({ id: 'item-9', question: 'Question 9' });

    const db = createMockDb();
    (db.query.parkingLotItems.findMany as jest.Mock).mockResolvedValue(
      existingRows,
    );
    (db.insert as jest.Mock).mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([newRow]),
      }),
    });

    const result = await addParkingLotItem(
      db,
      profileId,
      sessionId,
      'Question 9',
    );

    expect(result).not.toBeNull();
    expect(db.insert).toHaveBeenCalled();
  });
});
