import { EdgeProps, Node } from '@xyflow/react';
import { useMemo } from 'react';

// Configuration constants
const CONTROL_POINT_SPACING = 100; // Target distance between control points (adaptive density)
const NUM_ITERATIONS = 10;
const NODE_RADIUS = 70; // Approximate radius for collision detection with the "hard core" of nodes
const INFLUENCE_RADIUS = 200; // Distance at which nodes influence control points
const FORCE_STRENGTH = 20; // Base strength of repulsive force
const MAX_FORCE = 50; // Maximum force that can be applied to a control point


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

  const edgePath = useMemo(() => {
    if (!nodes || nodes.length === 0) {
      // Fallback to simple line
      return `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
    }

    // Direction vector of the direct line
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const lineLength = Math.sqrt(dx * dx + dy * dy);

    if (lineLength === 0) {
      return `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
    }

    // Calculate adaptive number of control points based on distance
    const numControlPoints = Math.max(3, Math.ceil(lineLength / CONTROL_POINT_SPACING));

    // Initialize control points evenly spaced along direct line
    const controlPoints: Point[] = [];
    for (let i = 0; i < numControlPoints; i++) {
      const t = i / (numControlPoints - 1);
      controlPoints.push({
        x: sourceX + t * (targetX - sourceX),
        y: sourceY + t * (targetY - sourceY),
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
        x: node.position!.x + 60, // Center of 120px node
        y: node.position!.y + 60,
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

        // Clamp force to prevent extreme deviations
        const clampedForce = Math.max(-MAX_FORCE, Math.min(MAX_FORCE, totalForce));

        // Move control point perpendicular to line
        cp.x += perpX * clampedForce * attenuation;
        cp.y += perpY * clampedForce * attenuation;
      }
    }

    return generateCubicSpline(controlPoints);
  }, [source, target, sourceX, sourceY, targetX, targetY, nodes]);

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
    </>
  );
}
