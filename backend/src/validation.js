export function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function taskId(value) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 4294967295) {
    throw badRequest('Task ID must be a positive integer.');
  }
  return Number(value);
}

export function validateStatus(value) {
  if (!['pending', 'completed'].includes(value)) {
    throw badRequest('Status must be pending or completed.');
  }
  return value;
}

export function validateBody(body, allowedFields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Send a JSON object.');
  }
  if (Object.keys(body).some((field) => !allowedFields.includes(field))) {
    throw badRequest(`Allowed fields: ${allowedFields.join(', ')}.`);
  }
}

export function validateTask(body, { creating = false } = {}) {
  validateBody(body, ['title', 'description', 'status']);
  if (
    typeof body.title !== 'string' ||
    !body.title.trim() ||
    [...body.title.trim()].length > 200
  ) {
    throw badRequest('Title is required and must be 200 characters or fewer.');
  }
  const description = body.description === undefined ? '' : body.description;
  if (
    typeof description !== 'string' ||
    [...description.trim()].length > 5000
  ) {
    throw badRequest(
      'Description must be a string of 5000 characters or fewer.',
    );
  }
  return {
    title: body.title.trim(),
    description: description.trim(),
    status: validateStatus(
      creating && body.status === undefined ? 'pending' : body.status,
    ),
  };
}
