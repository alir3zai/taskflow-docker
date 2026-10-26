import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Icon from './Icon.jsx';
import TaskDialog from './TaskDialog.jsx';

const filters = [
  { id: 'all', label: 'All tasks', icon: 'grid' },
  { id: 'pending', label: 'Pending', icon: 'clock' },
  { id: 'completed', label: 'Completed', icon: 'circleCheck' },
];

function TaskCard({ task, busy, onToggle, onEdit, onDelete }) {
  const completed = task.status === 'completed';
  const date = new Date(task.created_at);
  return (
    <article className={`task-card ${completed ? 'is-completed' : ''}`}>
      <div className="task-top">
        <button
          className={`task-checkbox ${completed ? 'checked' : ''}`}
          disabled={busy}
          aria-label={`Mark ${task.title} as ${completed ? 'pending' : 'completed'}`}
          aria-pressed={completed}
          onClick={() => onToggle(task)}
        >
          {completed && <Icon name="check" size={16} />}
        </button>
        <span className={`status-pill ${task.status}`}>
          <span />
          {completed ? 'Completed' : 'Pending'}
        </span>
        <div className="task-actions">
          <button
            className="icon-button"
            aria-label={`Edit ${task.title}`}
            title="Edit task"
            disabled={busy}
            onClick={() => onEdit(task)}
          >
            <Icon name="edit" size={17} />
          </button>
          <button
            className="icon-button delete-button"
            aria-label={`Delete ${task.title}`}
            title="Delete task"
            disabled={busy}
            onClick={() => onDelete(task)}
          >
            <Icon name="trash" size={17} />
          </button>
        </div>
      </div>
      <h3>{task.title}</h3>
      <p
        className={`task-description ${!task.description ? 'no-description' : ''}`}
      >
        {task.description || 'A fresh task, ready for your next step.'}
      </p>
      <div className="task-footer">
        <span>
          <Icon name="calendar" size={14} />
          <time dateTime={task.created_at} title={date.toLocaleString()}>
            {date.toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </time>
        </span>
        <span className="task-id">#{String(task.id).padStart(3, '0')}</span>
      </div>
    </article>
  );
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');
  const mutating = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException('Request timed out.', 'TimeoutError'),
        ),
      15000,
    );
    setLoading(true);
    setError('');
    api
      .list(controller.signal)
      .then(setTasks)
      .catch((error) => {
        if (error.name !== 'AbortError') setError(error.message);
      })
      .finally(() => {
        clearTimeout(timer);
        if (
          !controller.signal.aborted ||
          controller.signal.reason?.name === 'TimeoutError'
        )
          setLoading(false);
      });
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const completed = tasks.filter((task) => task.status === 'completed').length;
  const counts = {
    all: tasks.length,
    completed,
    pending: tasks.length - completed,
  };
  const progress = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;
  const visible = tasks
    .filter(
      (task) =>
        (filter === 'all' || task.status === filter) &&
        `${task.title} ${task.description}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase().trim()),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : (sort === 'oldest' ? 1 : -1) *
          (new Date(a.created_at) - new Date(b.created_at) || a.id - b.id),
    );

  async function mutate(action, message) {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    try {
      await action();
      setError('');
      setNotice(message);
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  async function saveTask(values, id) {
    await mutate(
      async () => {
        const saved = id
          ? await api.update(id, values)
          : await api.create(values);
        setTasks((current) =>
          id
            ? current.map((task) => (task.id === id ? saved : task))
            : [saved, ...current],
        );
        setDialog(null);
      },
      id
        ? 'Task updated. Keep the momentum going.'
        : 'New task added. One step closer.',
    );
  }

  async function deleteTask(id) {
    await mutate(async () => {
      await api.remove(id);
      setTasks((current) => current.filter((task) => task.id !== id));
      setDialog(null);
    }, 'Task deleted. A little more breathing room.');
  }

  async function toggleTask(task) {
    try {
      await mutate(
        async () => {
          const saved = await api.setStatus(
            task.id,
            task.status === 'completed' ? 'pending' : 'completed',
          );
          setTasks((current) =>
            current.map((item) => (item.id === saved.id ? saved : item)),
          );
        },
        task.status === 'completed'
          ? 'Task moved back to pending.'
          : 'Nicely done! Another task completed.',
      );
    } catch (error) {
      setError(error.message);
    }
  }

  function chooseFilter(value) {
    setFilter(value);
    setQuery('');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="TaskFlow home">
          <span className="brand-mark">
            <Icon name="check" size={25} />
          </span>
          taskflow<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Task views">
          {filters.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${filter === item.id ? 'active' : ''}`}
              aria-label={item.label}
              aria-current={filter === item.id ? 'page' : undefined}
              onClick={() => chooseFilter(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              <span className="nav-count">
                {loading || error ? '—' : counts[item.id]}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="leaf" size={25} />
          <h3>
            Small steps.
            <br />
            Meaningful progress.
          </h3>
          <p>
            You don’t have to do it all.
            <br />
            Just the next right thing.
          </p>
          <span className="note-line" />
        </div>
        <div className="workspace-profile">
          <span className="avatar">Y</span>
          <div>
            <strong>My workspace</strong>
            <span>A space to get things done</span>
          </div>
          <span className="profile-dot" />
        </div>
      </aside>

      <main>
        <header className="page-header">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Overview</strong>
          </div>
          <div className="today">
            <Icon name="calendar" size={16} />
            {new Date().toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        </header>
        <div className="page-content">
          <div className="page-title">
            <div>
              <div className="eyebrow">A FRESH PERSPECTIVE, EVERY DAY</div>
              <h1>
                Your everyday, organized<span>.</span>
              </h1>
              <p>A clear space for your tasks. A little more room to focus.</p>
            </div>
            <button
              className="button primary new-task"
              disabled={loading || busy || Boolean(error)}
              onClick={() => setDialog({ task: null })}
            >
              <Icon name="plus" size={19} />
              New task
            </button>
          </div>

          <section className="focus-banner" aria-label="Your progress">
            <div className="banner-copy">
              <span className="banner-eyebrow">
                <span /> FIND YOUR FLOW
              </span>
              <h2>
                A little focus.
                <br />A lot of progress.
              </h2>
              <p>
                Big things happen one small task at a time.
                <br />
                Let’s make a little progress today.
              </p>
            </div>
            <div className="banner-decoration" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="progress-area">
              <div
                className="progress-ring"
                style={{ '--progress': `${loading || error ? 0 : progress}%` }}
              >
                <div>
                  <strong>{loading || error ? '—' : `${progress}%`}</strong>
                  <span>complete</span>
                </div>
              </div>
              <p>
                {loading
                  ? 'Finding your flow…'
                  : error
                    ? 'Waiting for your tasks'
                    : tasks.length
                      ? `${completed} of ${tasks.length} tasks done. You’ve got this.`
                      : 'Your next chapter starts with one task.'}
              </p>
            </div>
          </section>

          <section className="stats" aria-label="Task statistics">
            {filters.map((item) => (
              <div className={`stat-card stat-${item.id}`} key={item.id}>
                <span className="stat-icon">
                  <Icon name={item.icon} size={21} />
                </span>
                <div>
                  <span className="stat-label">
                    {item.id === 'all' ? 'Total tasks' : item.label}
                  </span>
                  <strong>{loading || error ? '—' : counts[item.id]}</strong>
                </div>
                <span className="stat-caption">
                  {item.id === 'all'
                    ? 'Everything in one place'
                    : item.id === 'pending'
                      ? 'A little potential'
                      : 'Progress worth celebrating'}
                </span>
              </div>
            ))}
          </section>

          <section
            className="tasks-section"
            aria-labelledby="tasks-heading"
            aria-busy={loading || busy}
          >
            <div className="section-heading">
              <h2 id="tasks-heading">
                Your tasks <span>{loading || error ? '—' : tasks.length}</span>
              </h2>
              <span className="section-hint">Less clutter. More clarity.</span>
            </div>
            <div className="task-toolbar">
              <div className="filter-tabs" aria-label="Filter tasks">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={filter === item.id}
                    className={filter === item.id ? 'selected' : ''}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.id === 'all' ? 'All tasks' : item.label}
                    <span>{loading || error ? '—' : counts[item.id]}</span>
                  </button>
                ))}
              </div>
              <div className="toolbar-controls">
                <div className="search-field">
                  <Icon name="search" size={17} />
                  <input
                    type="search"
                    aria-label="Search tasks"
                    placeholder="Search tasks…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <select
                  className="sort-select"
                  aria-label="Sort tasks"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title">Title A–Z</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="error-banner" role="alert">
                <Icon name="alert" size={20} />
                <p>{error}</p>
                <button
                  className="button secondary"
                  disabled={loading || busy}
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  Retry
                </button>
              </div>
            )}
            {loading ? (
              <div
                className="task-grid skeleton-grid"
                role="status"
                aria-label="Loading tasks"
              >
                {[1, 2, 3, 4].map((number) => (
                  <div className="skeleton-card" key={number}>
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : visible.length ? (
              <div className="task-grid">
                {visible.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    busy={busy}
                    onToggle={toggleTask}
                    onEdit={(task) => setDialog({ task })}
                    onDelete={(task) => setDialog({ task, deleting: true })}
                  />
                ))}
              </div>
            ) : (
              !error && (
                <div className="empty-state">
                  <span className="empty-icon">
                    <Icon
                      name={filter === 'completed' ? 'circleCheck' : 'leaf'}
                      size={29}
                    />
                  </span>
                  <h3>
                    {query
                      ? 'No tasks found'
                      : filter === 'completed'
                        ? 'Good things take small steps.'
                        : filter === 'pending'
                          ? 'A little breathing room.'
                          : 'A clear space. A fresh start.'}
                  </h3>
                  <p>
                    {query
                      ? 'Try another search or clear your filters.'
                      : filter === 'completed'
                        ? 'Your completed tasks will find a home here.'
                        : filter === 'pending'
                          ? 'You’re all caught up. Ready for something new?'
                          : 'Add your first task and let’s get something good going.'}
                  </p>
                  <button
                    className="button secondary"
                    onClick={() =>
                      query ? setQuery('') : setDialog({ task: null })
                    }
                  >
                    {query ? 'Clear search' : 'Create a task'}
                    <Icon name={query ? 'close' : 'plus'} size={16} />
                  </button>
                </div>
              )
            )}
            {!loading && visible.length > 0 && (
              <div className="list-caption">
                Showing {visible.length} of {tasks.length} tasks
                <span>
                  <span className="tiny-dot" />A little more organized
                </span>
              </div>
            )}
          </section>
          <footer className="page-footer">
            <span>Made for a little more focus.</span>
            <span>
              TaskFlow <span className="footer-star">✳</span> One task at a
              time.
            </span>
          </footer>
        </div>
      </main>
      <div
        className={`toast ${notice ? 'visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        {notice && (
          <>
            <Icon name="circleCheck" size={19} />
            {notice}
          </>
        )}
      </div>
      {dialog && (
        <TaskDialog
          task={dialog.task}
          deleting={dialog.deleting}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={saveTask}
          onDelete={deleteTask}
        />
      )}
    </div>
  );
}
