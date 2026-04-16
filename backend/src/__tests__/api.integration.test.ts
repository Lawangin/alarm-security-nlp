import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { reset } from '../services/securityService.js';

beforeEach(() => {
  reset();
});

// ---------------------------------------------------------------------------
// GET /healthz
// ---------------------------------------------------------------------------
describe('GET /healthz', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('includes correlationId in response', async () => {
    const res = await request(app).get('/healthz');
    expect(res.body.correlationId).toBeTruthy();
  });

  it('propagates X-Correlation-ID header when provided', async () => {
    const id = 'test-correlation-123';
    const res = await request(app).get('/healthz').set('X-Correlation-ID', id);
    expect(res.body.correlationId).toBe(id);
    expect(res.headers['x-correlation-id']).toBe(id);
  });

  it('includes systemState and userCount', async () => {
    const res = await request(app).get('/healthz');
    expect(res.body.data.systemState).toEqual({ armed: false, mode: null });
    expect(res.body.data.userCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/arm-system
// ---------------------------------------------------------------------------
describe('POST /api/arm-system', () => {
  it('arms with default mode "away"', async () => {
    const res = await request(app).post('/api/arm-system').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ armed: true, mode: 'away' });
  });

  it('arms with explicit mode "home"', async () => {
    const res = await request(app).post('/api/arm-system').send({ mode: 'home' });
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('home');
  });

  it('arms with explicit mode "stay"', async () => {
    const res = await request(app).post('/api/arm-system').send({ mode: 'stay' });
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('stay');
  });

  it('returns 400 for invalid mode', async () => {
    const res = await request(app).post('/api/arm-system').send({ mode: 'turbo' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 409 ALREADY_ARMED when already armed', async () => {
    await request(app).post('/api/arm-system').send({});
    const res = await request(app).post('/api/arm-system').send({});
    expect(res.status).toBe(409);
    expect(res.body.error.errorCode).toBe('ALREADY_ARMED');
  });
});

// ---------------------------------------------------------------------------
// POST /api/disarm-system
// ---------------------------------------------------------------------------
describe('POST /api/disarm-system', () => {
  it('disarms the system when armed', async () => {
    await request(app).post('/api/arm-system').send({});
    const res = await request(app).post('/api/disarm-system').send({});
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ armed: false, mode: null });
  });

  it('returns 409 ALREADY_DISARMED when not armed', async () => {
    const res = await request(app).post('/api/disarm-system').send({});
    expect(res.status).toBe(409);
    expect(res.body.error.errorCode).toBe('ALREADY_DISARMED');
  });
});

// ---------------------------------------------------------------------------
// POST /api/add-user
// ---------------------------------------------------------------------------
describe('POST /api/add-user', () => {
  it('adds a valid user and returns 201', async () => {
    const res = await request(app)
      .post('/api/add-user')
      .send({ name: 'Alice', pin: '1234' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Alice');
    expect(res.body.data.pin).toBe('1234');
  });

  it('returns 400 for missing name', async () => {
    const res = await request(app)
      .post('/api/add-user')
      .send({ pin: '1234' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid PIN (too short)', async () => {
    const res = await request(app)
      .post('/api/add-user')
      .send({ name: 'Alice', pin: '12' });
    expect(res.status).toBe(400);
    expect(res.body.error.errorCode).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for non-numeric PIN', async () => {
    const res = await request(app)
      .post('/api/add-user')
      .send({ name: 'Alice', pin: 'abcd' });
    expect(res.status).toBe(400);
  });

  it('returns 409 DUPLICATE_NAME for duplicate user', async () => {
    await request(app).post('/api/add-user').send({ name: 'Alice', pin: '1234' });
    const res = await request(app).post('/api/add-user').send({ name: 'Alice', pin: '5678' });
    expect(res.status).toBe(409);
    expect(res.body.error.errorCode).toBe('DUPLICATE_NAME');
  });
});

// ---------------------------------------------------------------------------
// POST /api/remove-user
// ---------------------------------------------------------------------------
describe('POST /api/remove-user', () => {
  beforeEach(async () => {
    await request(app).post('/api/add-user').send({ name: 'Alice', pin: '1234' });
  });

  it('removes a user by name', async () => {
    const res = await request(app).post('/api/remove-user').send({ name: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
  });

  it('removes a user by PIN', async () => {
    const res = await request(app).post('/api/remove-user').send({ pin: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
  });

  it('returns 400 when neither name nor pin is provided', async () => {
    const res = await request(app).post('/api/remove-user').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 USER_NOT_FOUND for unknown user', async () => {
    const res = await request(app).post('/api/remove-user').send({ name: 'Nobody' });
    expect(res.status).toBe(404);
    expect(res.body.error.errorCode).toBe('USER_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /api/list-users
// ---------------------------------------------------------------------------
describe('GET /api/list-users', () => {
  it('returns empty array when no users exist', async () => {
    const res = await request(app).get('/api/list-users');
    expect(res.status).toBe(200);
    expect(res.body.data.users).toEqual([]);
  });

  it('returns all users with masked PINs', async () => {
    await request(app).post('/api/add-user').send({ name: 'Alice', pin: '4321' });
    const res = await request(app).get('/api/list-users');
    expect(res.status).toBe(200);
    expect(res.body.data.users).toHaveLength(1);
    expect(res.body.data.users[0].pin).toBe('***1');
  });
});

// ---------------------------------------------------------------------------
// Full flow: healthz → arm → add-user → list-users → remove-user → disarm
// ---------------------------------------------------------------------------
describe('Full API flow', () => {
  it('completes a typical session end-to-end', async () => {
    // healthz
    const health = await request(app).get('/healthz');
    expect(health.body.data.status).toBe('ok');

    // arm
    const arm = await request(app).post('/api/arm-system').send({ mode: 'away' });
    expect(arm.body.data.armed).toBe(true);

    // add user
    const add = await request(app)
      .post('/api/add-user')
      .send({ name: 'Bob', pin: '9876' });
    expect(add.status).toBe(201);

    // list users
    const list = await request(app).get('/api/list-users');
    expect(list.body.data.users).toHaveLength(1);

    // remove user
    const remove = await request(app).post('/api/remove-user').send({ name: 'Bob' });
    expect(remove.body.data.removed).toBe(true);

    // disarm
    const disarm = await request(app).post('/api/disarm-system').send({});
    expect(disarm.body.data.armed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 404 and correlation ID
// ---------------------------------------------------------------------------
describe('Unknown routes and global behaviour', () => {
  it('returns JSON 404 for unknown route (not HTML)', async () => {
    const res = await request(app).get('/not-a-real-route');
    expect(res.status).toBe(404);
    expect(res.type).toMatch(/json/);
    expect(res.body.success).toBe(false);
  });

  it('includes correlationId on all successful responses', async () => {
    const res = await request(app).get('/api/list-users');
    expect(res.body.correlationId).toBeTruthy();
  });

  it('includes correlationId on error responses', async () => {
    const res = await request(app).post('/api/disarm-system').send({});
    expect(res.status).toBe(409);
    expect(res.body.correlationId).toBeTruthy();
  });
});
