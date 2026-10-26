import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';
import { loadConfig } from '../src/config.js';

test('real MySQL: CRUD, unchanged updates, Unicode, parameterization, and persistence across pools', async () => {
  const config = loadConfig();
  let database = createDatabase(config.database);
  let server;
  let id;
  let base;

  async function start() {
    server = createApp(database).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    if (server?.listening)
      await new Promise((resolve) => server.close(resolve));
    await database.close();
  }
  async function request(path, method = 'GET', body) {
    return fetch(`${base}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  try {
    await database.ping();
    await start();
    assert.equal((await request('/ready')).status, 200);
    const values = {
      title: `Integration task ${Date.now()} 🌱`,
      description: "A quoted ' value; DROP TABLE tasks; --",
      status: 'pending',
    };
    const response = await request('/api/tasks', 'POST', values);
    assert.equal(response.status, 201);
    const created = await response.json();
    id = created.id;
    assert.equal(created.title, values.title);
    assert.equal(created.description, values.description);
    assert.ok(!Number.isNaN(Date.parse(created.created_at)));
    assert.equal(
      (await request(`/api/tasks/${id}`, 'PUT', values)).status,
      200,
    );
    assert.equal(
      (await request(`/api/tasks/${id}/status`, 'PATCH', { status: 'pending' }))
        .status,
      200,
    );

    // Reopen both HTTP and database connections to prove data survives the application lifecycle.
    await stop();
    database = createDatabase(config.database);
    await start();
    const persisted = await (await request(`/api/tasks/${id}`)).json();
    assert.deepEqual(persisted, created);
    assert.ok(
      (await (await request('/api/tasks')).json()).some(
        (task) => task.id === id,
      ),
    );
    assert.equal(
      (
        await request(`/api/tasks/${id}`, 'PUT', {
          ...values,
          title: 'Updated task',
        })
      ).status,
      200,
    );
    const completed = await request(`/api/tasks/${id}/status`, 'PATCH', {
      status: 'completed',
    });
    assert.equal((await completed.json()).status, 'completed');
    assert.equal((await request(`/api/tasks/${id}`, 'DELETE')).status, 204);
    assert.equal((await request(`/api/tasks/${id}`)).status, 404);
    id = undefined;
  } finally {
    if (id) await database.remove(id);
    await stop();
  }
});
