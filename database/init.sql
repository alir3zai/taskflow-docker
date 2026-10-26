CREATE DATABASE IF NOT EXISTS taskflow
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

USE taskflow;

CREATE TABLE IF NOT EXISTS tasks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tasks_created (created_at, id),
  CONSTRAINT chk_task_title CHECK (CHAR_LENGTH(TRIM(title)) BETWEEN 1 AND 200),
  CONSTRAINT chk_task_description CHECK (CHAR_LENGTH(description) <= 5000)
);

-- Seed only an empty table; running this script again preserves existing tasks.
INSERT INTO tasks (title, description, status)
SELECT seed.title, seed.description, seed.status
FROM (
  SELECT 'Plan your week' AS title,
         'Make a little space for the things that matter. Pick three priorities for the week.' AS description,
         'pending' AS status
  UNION ALL
  SELECT 'Explore the TaskFlow API',
         'Try the health and readiness endpoints, then create a task through the REST API.',
         'pending'
  UNION ALL
  SELECT 'Set up your workspace',
         'Install dependencies, connect MySQL, and get your local development environment running.',
         'completed'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM tasks);
