import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export default function TaskDialog({
  task,
  deleting,
  busy,
  onClose,
  onSave,
  onDelete,
}) {
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState(task?.status ?? 'pending');
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    titleRef.current?.focus();
    return () => dialog.close();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!deleting && !title.trim()) {
      setError('Give your task a title.');
      return;
    }
    setError('');
    try {
      if (deleting) await onDelete(task.id);
      else
        await onSave(
          { title: title.trim(), description: description.trim(), status },
          task?.id,
        );
    } catch (error) {
      setError(error.message);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="task-dialog"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div className={`dialog-icon ${deleting ? 'danger-soft' : ''}`}>
            <Icon name={deleting ? 'trash' : 'edit'} size={24} />
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id="dialog-title">
          {deleting
            ? 'Delete this task?'
            : task
              ? 'Make it your own.'
              : 'Make room for a new idea.'}
        </h2>
        <p id="dialog-description" className="muted">
          {deleting
            ? `“${task.title}” will be permanently deleted. This cannot be undone.`
            : 'A small step today is progress for tomorrow.'}
        </p>
        {!deleting && (
          <fieldset disabled={busy}>
            <label htmlFor="task-title">
              Task title <span className="required">*</span>
            </label>
            <input
              id="task-title"
              ref={titleRef}
              required
              maxLength={200}
              placeholder="What would you like to get done?"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <label htmlFor="task-description">
              Description <span className="optional">optional</span>
            </label>
            <textarea
              id="task-description"
              rows={4}
              maxLength={5000}
              placeholder="Add a little context, a few details, or your next steps…"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="field-meta">
              {description.length.toLocaleString()} / 5,000
            </div>
            <label htmlFor="task-status">Status</label>
            <select
              id="task-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
          </fieldset>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`button ${deleting ? 'danger' : 'primary'}`}
            disabled={busy}
          >
            {busy
              ? 'Saving…'
              : deleting
                ? 'Delete task'
                : task
                  ? 'Save changes'
                  : 'Create task'}
            {!busy && <Icon name={deleting ? 'trash' : 'arrow'} size={17} />}
          </button>
        </div>
      </form>
    </dialog>
  );
}
