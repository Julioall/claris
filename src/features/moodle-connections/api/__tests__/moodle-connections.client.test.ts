import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/http/edge-function-client', () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeMock(...args),
}));

import {
  createMoodleConnection,
  disconnectMoodleConnection,
  listMoodleConnections,
  updateMoodleConnectionReauth,
} from '../moodle-connections.client';

const SITE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONNECTION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const dto = {
  alias: 'FIEG',
  canWrite: false,
  id: CONNECTION_ID,
  lastValidatedAt: null,
  reauthEnabled: true,
  site: { id: SITE_ID, name: 'FIEG Moodle', slug: 'fieg' },
  status: 'active',
  usernameMasked: 't*****r',
};

describe('moodle-connections frontend client', () => {
  beforeEach(() => invokeMock.mockReset());

  it('uses connection identifiers and never accepts a browser-provided Moodle URL', async () => {
    invokeMock.mockResolvedValue({ contractVersion: 2, connection: dto });

    await createMoodleConnection({
      alias: ' FIEG ',
      moodlePassword: 'secret',
      moodleUsername: ' teacher ',
      siteId: SITE_ID,
    });

    expect(invokeMock).toHaveBeenCalledWith('moodle-connections', {
      body: {
        action: 'create_connection',
        alias: 'FIEG',
        canWrite: false,
        moodlePassword: 'secret',
        moodleUsername: 'teacher',
        siteId: SITE_ID,
      },
    });
  });

  it('keeps reauthorization scoped to one explicit connection', async () => {
    invokeMock.mockResolvedValue({ contractVersion: 2, connection: dto });

    await updateMoodleConnectionReauth({
      connectionId: CONNECTION_ID,
      enabled: true,
      moodlePassword: 'secret',
      moodleUsername: 'teacher',
    });

    expect(invokeMock.mock.calls[0][1].body).toMatchObject({
      action: 'update_reauth',
      connectionId: CONNECTION_ID,
    });
  });

  it('rejects malformed responses before they reach UI state', async () => {
    invokeMock.mockResolvedValue({ contractVersion: 2, connections: [{ ...dto, status: 'unknown' }] });
    await expect(listMoodleConnections()).rejects.toThrow('resposta invalida');
  });

  it('returns pending leases from two-phase disconnect', async () => {
    invokeMock.mockResolvedValue({
      contractVersion: 2,
      connection: { ...dto, status: 'disconnecting' },
      pendingLeases: 1,
    });
    await expect(disconnectMoodleConnection(CONNECTION_ID)).resolves.toMatchObject({
      pendingLeases: 1,
      connection: { id: CONNECTION_ID, status: 'disconnecting' },
    });
  });
});
