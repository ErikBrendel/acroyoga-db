import { EdgeProps, Node } from '@xyflow/react';
import { useMemo } from 'react';
import { NODE_RADIUS } from '../utils/nodeConstants';

// Configuration constants
const CONTROL_POINT_SPACING = 100; // Target distance between control points (adaptive density)
const MIN_SUBDIVISION_LENGTH = 180; // Edges shorter than this get no intermediate control points
const NUM_ITERATIONS = 20;
const INFLUENCE_RADIUS = 200; // Distance at which nodes influence control points
const FORCE_STRENGTH = 20; // Base strength of repulsive force
const MAX_FORCE = 50; // Maximum force that can be applied to a control point
const NEIGHBOR_STRENGTH = 0.4; // How strongly each point is pulled toward its neighbors' perp average
const ALIGNMENT_OFFSET_Y = 2; // Vertical offset for edge alignment


interface SmartEdgeProps extends EdgeProps {
  nodes?: Node[];
}

interface Point {
  x: number;
  y: number;
}

// Calculate distance between two points
function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Convert B-spline control points to cubic Bezier segments for SVG
function generateCubicSpline(controlPoints: Point[]): string {
  if (controlPoints.length < 2) return '';
  if (controlPoints.length === 2) {
    return `M ${controlPoints[0].x},${controlPoints[0].y} L ${controlPoints[1].x},${controlPoints[1].y}`;
  }

  // For clamped B-spline (curve passes through endpoints),
  // triple first and last control points for C2 continuity at endpoints
  const extended = [
    controlPoints[0],
    controlPoints[0],
    controlPoints[0],
    ...controlPoints.slice(1, -1),
    controlPoints[controlPoints.length - 1],
    controlPoints[controlPoints.length - 1],
    controlPoints[controlPoints.length - 1],
  ];

  // Force start at exact first control point
  let path = `M ${controlPoints[0].x},${controlPoints[0].y}`;

  // Generate cubic Bezier segments from B-spline
  // Each segment uses 4 consecutive extended control points
  const numSegments = controlPoints.length - 1;
  for (let i = 0; i < numSegments; i++) {
    const P1 = extended[i + 2];
    const P2 = extended[i + 3];
    const P3 = extended[i + 4];

    // Convert B-spline basis to Bezier control points
    // Using uniform cubic B-spline to Bezier conversion matrix

    // End point of segment - force exact position for last segment
    const end = i === numSegments - 1
      ? controlPoints[controlPoints.length - 1]
      : {
          x: (P1.x + 4 * P2.x + P3.x) / 6,
          y: (P1.y + 4 * P2.y + P3.y) / 6,
        };

    // First Bezier control point
    const c1 = {
      x: (2 * P1.x + P2.x) / 3,
      y: (2 * P1.y + P2.y) / 3,
    };

    // Second Bezier control point
    const c2 = {
      x: (P1.x + 2 * P2.x) / 3,
      y: (P1.y + 2 * P2.y) / 3,
    };

    path += ` C ${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`;
  }

  return path;
}

export function SmartEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition: _sourcePosition,
  targetPosition: _targetPosition,
  style = {},
  markerEnd,
  data,
}: SmartEdgeProps) {
  const nodes = (data as any)?.nodes as Node[] | undefined;

  const edgeData = useMemo(() => {
    // Direction vector of the direct line
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const lineLength = Math.sqrt(dx * dx + dy * dy);

    if (!nodes || nodes.length === 0 || lineLength === 0) {
      // Fallback to simple line
      return {
        path: `M ${sourceX},${sourceY} L ${targetX},${targetY}`,
        startX: sourceX,
        startY: sourceY,
        endX: targetX,
        endY: targetY,
      };
    }

    // Check if this is a mirror connection band (skip padding for those)
    const isMirrorEdge = id.startsWith('mirror-');

    // Add padding at each endpoint by moving them towards each other (except for mirror edges)
    const ENDPOINT_PADDING = isMirrorEdge ? 0 : NODE_RADIUS * 0.95;
    const unitDx = dx / lineLength;
    const unitDy = dy / lineLength;

    const paddedSourceX = sourceX + unitDx * ENDPOINT_PADDING;
    const paddedSourceY = sourceY + unitDy * ENDPOINT_PADDING;
    const paddedTargetX = targetX - unitDx * ENDPOINT_PADDING;
    const paddedTargetY = targetY - unitDy * ENDPOINT_PADDING;

    // Calculate adaptive number of control points based on distance
    const numControlPoints = lineLength < MIN_SUBDIVISION_LENGTH
      ? 2
      : Math.max(3, Math.ceil(lineLength / CONTROL_POINT_SPACING));

    // Initialize control points evenly spaced along direct line (using padded endpoints)
    const controlPoints: Point[] = [];
    for (let i = 0; i < numControlPoints; i++) {
      const t = i / (numControlPoints - 1);
      controlPoints.push({
        x: paddedSourceX + t * (paddedTargetX - paddedSourceX),
        y: paddedSourceY + t * (paddedTargetY - paddedSourceY),
      });
    }

    // Perpendicular unit vector (for pushing control points orthogonally)
    const perpX = -dy / lineLength;
    const perpY = dx / lineLength;

    // Get node centers (excluding source and target nodes)
    const nodeCenters: Point[] = nodes
      .filter(node => {
        // Skip source and target nodes by ID
        return node.id !== source && node.id !== target && node.position;
      })
      .map(node => ({
        x: node.position!.x + NODE_RADIUS,
        y: node.position!.y + NODE_RADIUS,
      }));

    // Iterative relaxation
    for (let iter = 0; iter < NUM_ITERATIONS; iter++) {
      // Attenuation factor (decreases over iterations for convergence)
      const attenuation = 1 - (iter / NUM_ITERATIONS);

      // Process each control point (skip first and last - they're fixed)
      for (let i = 1; i < numControlPoints - 1; i++) {
        const cp = controlPoints[i];
        let totalForce = 0;

        // Calculate repulsive force from nearby nodes
        for (const nodeCenter of nodeCenters) {
          const dist = distance(cp, nodeCenter);

          // Only influence if within radius
          if (dist < INFLUENCE_RADIUS) {
            // Repulsive force inversely proportional to distance
            const force = FORCE_STRENGTH * (1 - dist / INFLUENCE_RADIUS) / (dist / NODE_RADIUS);

            // Project force onto perpendicular direction
            // (determine which side of the line the node is on)
            const toCenterX = nodeCenter.x - cp.x;
            const toCenterY = nodeCenter.y - cp.y;
            const side = toCenterX * perpX + toCenterY * perpY;

            // Accumulate force (negative if node is on one side, positive on other)
            totalForce -= Math.sign(side) * force;
          }
        }

        // Neighbor alignment: pull toward perpendicular average of adjacent control points
        const prevPerp = controlPoints[i - 1].x * perpX + controlPoints[i - 1].y * perpY;
        const nextPerp = controlPoints[i + 1].x * perpX + controlPoints[i + 1].y * perpY;
        const cpPerp = cp.x * perpX + cp.y * perpY;
        totalForce += ((prevPerp + nextPerp) / 2 - cpPerp) * NEIGHBOR_STRENGTH;

        // Clamp force to prevent extreme deviations
        const clampedForce = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, totalForce));

        // Move control point perpendicular to line
        cp.x += perpX * clampedForce * attenuation;
        cp.y += perpY * clampedForce * attenuation;
      }
    }

    return {
      path: generateCubicSpline(controlPoints),
      startX: paddedSourceX,
      startY: paddedSourceY,
      endX: paddedTargetX,
      endY: paddedTargetY,
    };
  }, [id, source, target, sourceX, sourceY, targetX, targetY, nodes]);

  return (
    <g transform={`translate(0, ${ALIGNMENT_OFFSET_Y})`}>
      <path
        id={id}
        style={{ ...style, transition: 'opacity 0.3s ease-in-out' }}
        className="react-flow__edge-path"
        d={edgeData.path}
        markerEnd={markerEnd}
      />
    </g>
  );
}
