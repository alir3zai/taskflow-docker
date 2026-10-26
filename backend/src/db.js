import mysql from 'mysql2/promise';

export function createDatabase(config) {
  const pool = mysql.createPool(config);

  // Use UTC for both generated timestamps and JavaScript Date serialization.
  pool.on('connection', (connection) => {
    connection.query("SET time_zone = '+00:00'", (error) => {
      if (error) connection.destroy();
    });
  });

  async function execute(sql, values = []) {
    try {
      const [result] = await pool.execute({ sql, timeout: 5000 }, values);
      return result;
    } catch (cause) {
      const error = new Error('Database request failed.', { cause });
      error.databaseError = true;
      throw error;
    }
  }

  return {
    async ping() {
      await execute('SELECT 1');
    },
    close: () => pool.end(),
    async list() {
      return execute(
        'SELECT id, title, description, status, created_at FROM tasks ORDER BY created_at DESC, id DESC',
      );
    },
    async get(id) {
      const rows = await execute(
        'SELECT id, title, description, status, created_at FROM tasks WHERE id = ?',
        [id],
      );
      return rows[0] ?? null;
    },
    async create(task) {
      const result = await execute(
        'INSERT INTO tasks (title, description, status) VALUES (?, ?, ?)',
        [task.title, task.description, task.status],
      );
      return this.get(result.insertId);
    },
    async update(id, task) {
      // MySQL reports matched rows, including when the new values are unchanged.
      const result = await execute(
        'UPDATE tasks SET title = ?, description = ?, status = ? WHERE id = ?',
        [task.title, task.description, task.status, id],
      );
      return result.affectedRows ? this.get(id) : null;
    },
    async setStatus(id, status) {
      const result = await execute('UPDATE tasks SET status = ? WHERE id = ?', [
        status,
        id,
      ]);
      return result.affectedRows ? this.get(id) : null;
    },
    async remove(id) {
      const result = await execute('DELETE FROM tasks WHERE id = ?', [id]);
      return result.affectedRows > 0;
    },
  };
}
