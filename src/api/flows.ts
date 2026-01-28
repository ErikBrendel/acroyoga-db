export interface FlowCreateRequest {
  name: string;
  poseIds: string[];
}

export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  details?: string[];
  data?: T;
}

export async function createFlow(request: FlowCreateRequest): Promise<ApiResponse> {
  const response = await fetch('/api/flows', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create flow');
  }

  return data;
}
