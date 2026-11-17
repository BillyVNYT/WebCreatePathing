# BillyPath Studio v0.3

React + Vite autonomous path designer for the supplied `BillyDriveLib`.

## Run locally
Requires Node.js 20+.

```bash
npm install
npm run dev
```

## Movement types
- **Linear**: straight interpolation between start and end.
- **Arc**: quadratic curved arc controlled by a center/control point (not a constant-radius circle).
- **Cubic Bezier**: 4 control points.
- **Polyline**: piecewise straight segments through editable waypoints.
- **Spline**: Catmull-Rom smooth curve through editable waypoints.

## Heading modes
- **Constant**: hold the configured start heading.
- **Linear**: interpolate shortest-angle route from start heading to end heading.
- **Tangent**: face along the path tangent.
- **Interpolated**: currently uses the same shortest-angle start-to-end interpolation; waypoint-specific heading keys are not yet available.

## Main features
- Empty project on first load; robot must be created before adding paths.
- Drag robot on field or edit X/Y/heading numerically.
- Connected path chain: first P0 follows the robot; each later P0 follows the previous P3.
- Geometry-aware 2D and 3D path rendering.
- Seekable timeline; robot pose follows the same simulation clock in both views.
- Square no-go zones with drag resize and numeric side length.
- Custom field image and field dimensions.
- DECODE 2025–26 and BIOBUZZ 2026–27 schematic presets.
- Java export uses the existing `BillyDriveLib.BezierCurve` API. Linear, Arc, Polyline and Spline paths are approximated as one or more Bezier chunks.

## Coordinate convention
- +X = forward
- +Y = right
- Heading = CCW
- Distances = millimeters

## Important limitations
- The DECODE and BIOBUZZ presets are simplified visual schematics, not exact CAD or collision geometry.
- Arc is a quadratic curve, not a mathematically constant-radius circular arc.
- Obstacle detour is a basic Bezier-handle suggestion and does not guarantee collision-free motion.
- Simulation uses a simplified trapezoidal/triangular motion profile; it does not model real robot inertia, voltage, wheel slip, controller settling or obstacle collision response.
- Exported movement geometry is approximated with `BezierCurve` chunks because the exact Java API for native line/arc/spline primitives was not provided. It calls `waitForFinish()` after each chunk, so it may pause between chunks.
- Heading modes are represented in the editor and simulator; the current exporter records them in comments but does not issue heading-control commands. Wire them to the actual `BillyDriveLib` heading API before running.
- Confirm imports and method signatures in your robot project and test safely before enabling motors.


## v0.4 – Rotation commands

The movement menu now includes:
- **Turn in place**: rotates at the current position. The editor exposes start/end heading and angular velocity/acceleration limits. Java export uses `drive.turnToDegrees(...)`.
- **Drive + turn**: moves in a straight line while changing heading. Java export uses `drive.goToPose(x, y, heading)`.

These commands map to methods already present in the supplied `BillyDriveLib` (`turnToDegrees`, `goToPose`). The library also exposes `PathBuilder.lineToPose` for sequential path building.

The simulation estimates angular timing from the configured angular velocity and acceleration. It is a planning estimate, not a measured robot motion profile. The current Java export still approximates curved path types with Bezier chunks; heading interpolation configured on those curved paths is preview-only. Use the explicit **Drive + turn** command when you need a guaranteed exported simultaneous translation-and-heading command.

Generated Java waits with `drive.waitForFinish(this)`, matching the `BillyDriveLib` overload that accepts a `LinearOpMode`.
