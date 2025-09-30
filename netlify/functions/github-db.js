'use strict';

// Env vars to set in Netlify: GITHUB_TOKEN, GITHUB_REPO, GITHUB_OWNER, GITHUB_BRANCH, GITHUB_PATH

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return ok({});
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const owner = process.env.GITHUB_OWNER;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const path = process.env.GITHUB_PATH || 'data/ecomoni.json';

  if (!token || !repo || !owner) {
    return error(500, 'Missing GitHub env vars');
  }

  try {
    if (event.httpMethod === 'GET') {
      const content = await getFile(owner, repo, path, token, branch);
      return ok({ data: content });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const updated = await updateFile(owner, repo, path, token, branch, body);
      return ok({ success: true, commit: updated.commit.sha });
    }

    return error(405, 'Method Not Allowed');
  } catch (e) {
    return error(500, e.message || 'Unexpected error');
  }
};

async function getFile(owner, repo, path, token, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    }
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub get failed: ${res.status}`);
  const json = await res.json();
  const content = Buffer.from(json.content || '', 'base64').toString('utf8');
  try {
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function updateFile(owner, repo, path, token, branch, data) {
  // Get current sha if exists
  let sha = undefined;
  try {
    const meta = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    });
    if (meta.ok) {
      const metaJson = await meta.json();
      sha = metaJson.sha;
    }
  } catch {}

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const message = `chore(ecomoni): update data ${new Date().toISOString()}`;
  const content = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, content, branch, sha })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub update failed: ${res.status} ${txt}`);
  }
  return res.json();
}

function ok(body) {
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify(body)
  };
}

function error(status, message) {
  return {
    statusCode: status,
    headers: corsHeaders(),
    body: JSON.stringify({ error: message })
  };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
}


