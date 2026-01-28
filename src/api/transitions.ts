export interface TransitionCreateRequest {
  fromPoseId: string;
  toPoseId: string;
  nonReversible?: boolean;
}

export interface TransitionDeleteRequest {
  fromPoseId: string;
  toPoseId: string;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  details?: string[];
  data?: T;
}

export async function createTransition(request: TransitionCreateRequest): Promise<ApiResponse> {
  const response = await fetch('/api/transitions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create transition');
  }

  return data;
}

export async function deleteTransition(request: TransitionDeleteRequest): Promise<ApiResponse> {
  const response = await fetch('/api/transitions', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to delete transition');
  }

  return data;
}
