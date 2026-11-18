# BillyPath Studio v0.6

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
- Java export generates a fluent `drive.path()` PathBuilder chain using `lineTo`, `lineToPose`, `turnTo`, `splineTo`, `then` and `waitToFinish`.
- Cubic Bezier, Arc and Spline segments can export LINEAR heading interpolation by using `followPath(BezierCurve, HeadingMode.LINEAR)` inside a cooperative BillyDriveLib `Action`. Constant-heading curves use `splineTo()`.
- Turn in place exports as `PathBuilder.turnTo()` and is a rotation-only step.
- Action markers can be attached after any segment. Export inserts a sequential `.then(BillyDriveLib.Actions.instant(() -> yourMethod()))` call and generates an editable helper method outside `runOpMode()`.

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
- Arc and Spline geometry are approximated by multiple cubic Bezier segments; Polyline exports as connected `lineTo()` waypoints.
- The supplied `BillyDriveLib.PathBuilder.splineTo()` holds the current heading. Curved LINEAR/INTERPOLATED heading is exported through the library's lower-level `followPath(BezierCurve, HeadingMode.LINEAR)` API wrapped in a cooperative `BillyDriveLib.Action`. Tangent heading is not supported by the supplied library API and is marked in `EXPORT NOTES`.
- Linear heading on a straight segment exports as `lineToPose()`. Turn and Drive + turn export as `turnTo()` and `lineToPose()`.
- Confirm the generated coordinates, imports and method signatures in your robot project. Test with low power and a clear field before competition use.


## v0.4 – Rotation commands

The movement menu now includes:
- **Turn in place**: rotates at the current position. The editor exposes start/end heading and angular velocity/acceleration limits. Java export uses `drive.turnToDegrees(...)`.
- **Drive + turn**: moves in a straight line while changing heading. Java export uses `drive.goToPose(x, y, heading)`.

These commands map to methods already present in the supplied `BillyDriveLib` (`turnToDegrees`, `goToPose`). The library also exposes `PathBuilder.lineToPose` for sequential path building.

The simulation estimates angular timing from the configured angular velocity and acceleration. It is a planning estimate, not a measured robot motion profile. The current Java export still approximates curved path types with Bezier chunks; heading interpolation configured on those curved paths is preview-only. Use the explicit **Drive + turn** command when you need a guaranteed exported simultaneous translation-and-heading command.

Generated Java waits with `drive.waitForFinish(this)`, matching the `BillyDriveLib` overload that accepts a `LinearOpMode`.


## v0.5 – PathBuilder export

The Java exporter now targets the supplied `BillyDriveLib` PathBuilder API:

```java
boolean pathCompleted = drive.path()
    .lineTo(500, 0)
    .lineToPose(1000, 0, 90)
    .splineTo(1150, 0, 1300, 250, 1500, 350)
    .turnTo(180)
    .waitToFinish(this, 15.0);
```

The exporter converts the field path into robot-relative millimeters from the selected start pose. Curves that are not cubic Bezier are approximated by chained `splineTo()` calls. The code generator adds `EXPORT NOTES` when an editor heading mode cannot be represented exactly by the current PathBuilder API.


## v0.6 – Curved heading and action markers

- Curved segments configured as Linear/Interpolated heading now export using `BillyDrive.followPath(..., HeadingMode.LINEAR)` inside a cooperative `Action`; the action calls `drive.update()` until the motion finishes.
- Turn-in-place segments export as `.turnTo(targetHeading)` in the same PathBuilder sequence.
- Use **Add action marker** in the selected segment inspector to schedule custom code immediately after that segment.
- Each marker exports as `.then(BillyDriveLib.Actions.instant(() -> methodName()))`. A corresponding `private void methodName()` stub is generated outside `runOpMode()` so the programmer can add mechanism code.
- Tangent heading remains unsupported by the supplied BillyDriveLib API; the exporter warns rather than silently pretending it is implemented.
