export interface PosePosition {
  x: number;
  y: number;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  details?: string[];
  data?: T;
}

export async function updatePosePositions(
  positions: Record<string, PosePosition | null>
): Promise<ApiResponse> {
  const response = await fetch('/api/layout/positions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ positions }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to update positions');
  }

  return data;
}

