export interface StoredPoses3d {
  saved: Record<string, unknown>;
  drafts: Record<string, unknown>;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.details || data.error || `${method} ${url} failed`);
  }
  return data;
}

export const fetchPoses3d = () => request<StoredPoses3d>('GET', '/api/poses3d');

export const savePose3d = (poseId: string, json: string) => request('PUT', '/api/poses3d', { poseId, json });

export const deleteDraft3d = (poseId: string) => request('DELETE', '/api/poses3d/draft', { poseId });
