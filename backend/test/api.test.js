import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let server;
let base;
let available = true;
const tasks = new Map();
let nextId = 1;

function checkDatabase() {
  if (!available) {
    const error = new Error('A simulated connection failure');
    error.databaseError = true;
    error.cause = { code: 'ECONNREFUSED' };
    throw error;
  }
}

// This test double isolates the HTTP contract. mysql.test.js exercises real SQL.
const database = {
  async ping() {
    checkDatabase();
  },
  async list() {
    checkDatabase();
    return [...tasks.values()];
  },
  async get(id) {
    checkDatabase();
    return tasks.get(id) ?? null;
  },
  async create(task) {
    checkDatabase();
    const saved = {
      ...task,
      id: nextId++,
      created_at: new Date().toISOString(),
    };
    tasks.set(saved.id, saved);
    return saved;
  },
  async update(id, task) {
    checkDatabase();
    if (!tasks.has(id)) return null;
    const saved = { ...tasks.get(id), ...task };
    tasks.set(id, saved);
    return saved;
  },
  async setStatus(id, status) {
    return this.update(id, { status });
  },
  async remove(id) {
    checkDatabase();
    return tasks.delete(id);
  },
};

before(async () => {
  server = createApp(database, { logger: { error() {} } }).listen(
    0,
    '127.0.0.1',
  );
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => new Promise((resolve) => server.close(resolve)));

async function request(path, method = 'GET', body) {
  return fetch(`${base}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

test('liveness and readiness return their independent states', async () => {
  assert.deepEqual(await (await request('/health')).json(), { status: 'ok' });
  assert.equal((await request('/ready')).status, 200);
});

test('CRUD contract: create, list, retrieve, edit, complete, reopen, delete', async () => {
  const response = await request('/api/tasks', 'POST', {
    title: '  Learn REST  ',
    description: '  Start here.  ',
  });
  assert.equal(response.status, 201);
  const task = await response.json();
  assert.equal(task.title, 'Learn REST');
  assert.equal(task.description, 'Start here.');
  assert.equal(task.status, 'pending');
  assert.ok(task.id);
  assert.ok(!Number.isNaN(Date.parse(task.created_at)));
  assert.equal(response.headers.get('location'), `/api/tasks/${task.id}`);
  assert.ok(
    (await (await request('/api/tasks')).json()).some(
      (item) => item.id === task.id,
    ),
  );
  assert.deepEqual(await (await request(`/api/tasks/${task.id}`)).json(), task);
  const updated = await request(`/api/tasks/${task.id}`, 'PUT', {
    title: 'Learn MySQL',
    description: '',
    status: 'pending',
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).title, 'Learn MySQL');
  for (const status of ['completed', 'pending', 'pending']) {
    const toggled = await request(`/api/tasks/${task.id}/status`, 'PATCH', {
      status,
    });
    assert.equal(toggled.status, 200);
    assert.equal((await toggled.json()).status, status);
  }
  assert.equal((await request(`/api/tasks/${task.id}`, 'DELETE')).status, 204);
  assert.equal((await request(`/api/tasks/${task.id}`)).status, 404);
});

test('invalid task bodies are rejected before database access', async () => {
  const bodies = [
    null,
    [],
    {},
    { title: ' ' },
    { title: 42 },
    { title: 'x'.repeat(201) },
    { title: 'Test', description: null },
    { title: 'Test', description: 'x'.repeat(5001) },
    { title: 'Test', status: 'done' },
    { title: 'Test', id: 8 },
  ];
  for (const body of bodies) {
    const response = await request('/api/tasks', 'POST', body);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('full updates require a valid title and status; status patch accepts only status', async () => {
  assert.equal(
    (await request('/api/tasks/1', 'PUT', { title: 'Task' })).status,
    400,
  );
  assert.equal((await request('/api/tasks/1/status', 'PATCH', {})).status, 400);
  assert.equal(
    (await request('/api/tasks/1/status', 'PATCH', { status: 'done' })).status,
    400,
  );
  assert.equal(
    (
      await request('/api/tasks/1/status', 'PATCH', {
        status: 'pending',
        title: 'Oops',
      })
    ).status,
    400,
  );
});

test('invalid IDs and missing resources return useful client errors', async () => {
  for (const id of ['0', '-1', '1.5', 'abc', '4294967296']) {
    assert.equal((await request(`/api/tasks/${id}`)).status, 400);
  }
  assert.equal((await request('/api/tasks/4294967295')).status, 404);
  assert.equal((await request('/api/tasks/4294967295', 'DELETE')).status, 404);
  assert.equal(
    (
      await request('/api/tasks/4294967295', 'PUT', {
        title: 'Missing',
        status: 'pending',
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request('/api/tasks/4294967295/status', 'PATCH', {
        status: 'completed',
      })
    ).status,
    404,
  );
});

test('malformed JSON and oversized payloads receive JSON errors', async () => {
  const malformed = await fetch(`${base}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.equal(
    (await malformed.json()).error,
    'Request body must be valid JSON.',
  );
  assert.equal(
    (
      await request('/api/tasks', 'POST', {
        title: 'Test',
        description: 'x'.repeat(70000),
      })
    ).status,
    413,
  );
});

test('CORS permits local frontend requests and JSON preflight', async () => {
  const response = await fetch(`${base}/api/tasks`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('access-control-allow-methods'), /POST/);
});

test('database outage returns 503 while health remains 200; requests recover', async () => {
  available = false;
  try {
    assert.equal((await request('/health')).status, 200);
    const readiness = await request('/ready');
    assert.equal(readiness.status, 503);
    assert.deepEqual(await readiness.json(), {
      status: 'not_ready',
      database: 'unavailable',
    });
    const response = await request('/api/tasks');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '5');
    assert.ok(!(await response.text()).includes('ECONNREFUSED'));
  } finally {
    available = true;
  }
  assert.equal((await request('/ready')).status, 200);
  assert.equal((await request('/api/tasks')).status, 200);
});

test('unknown endpoints return JSON 404', async () => {
  const response = await request('/missing');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Endpoint not found.' });
});

test('configuration reads credentials from the environment and validates ports', () => {
  const env = {
    DB_HOST: 'db.example',
    DB_USER: 'learner',
    DB_PASSWORD: '',
    DB_NAME: 'tasks',
    DB_PORT: '3307',
    PORT: '3001',
  };
  const config = loadConfig(env);
  assert.equal(config.database.host, 'db.example');
  assert.equal(config.database.password, '');
  assert.equal(config.database.port, 3307);
  assert.equal(config.port, 3001);
  for (const name of ['DB_HOST', 'DB_USER', 'DB_NAME', 'DB_PASSWORD']) {
    assert.throws(
      () => loadConfig({ ...env, [name]: undefined }),
      new RegExp(name),
    );
  }
  for (const value of ['0', '-1', '65536', 'abc', '3000.1']) {
    assert.throws(() => loadConfig({ ...env, PORT: value }), /PORT/);
    assert.throws(() => loadConfig({ ...env, DB_PORT: value }), /DB_PORT/);
  }
});
