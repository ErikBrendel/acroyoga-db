export interface PoseCreateRequest {
  id: string;
  name?: string;
  description?: string;
  mirroredPoseId?: string;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  details?: string[];
  data?: T;
}

export async function createPose(request: PoseCreateRequest): Promise<ApiResponse> {
  const response = await fetch('/api/poses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create pose');
  }

  return data;
}
