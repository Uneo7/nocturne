//! Rasterising operations onto the simulation grid.
//!
//! Strokes become a [`Stamp`] (per-cell coverage in `0..1`) computed once on
//! the CPU and then added into the grid. Backends share this code, so the
//! shader port only has to add a coverage field rather than mirror the
//! geometry. Coverage is perturbed by paper height (high grain resists paint,
//! so a wash edge breaks up on rough paper) and by a small seeded jitter of
//! the radius along the path.

use super::grid::SimulationGrid;
use super::ops::{BrushStroke, LiftStroke, Mask, Point, RadiusProfile, WaterStroke};
use super::scene::isotropic_scale;
use super::seed::{Seed, hash2};

#[derive(Debug, Clone, PartialEq)]
pub struct Stamp {
    pub width: u32,
    pub height: u32,
    pub coverage: Vec<f32>,
}

/// Paper-driven edge break-up and radius jitter, as fractions of the radius.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StampParams {
    pub edge_roughness: f32,
    pub jitter: f32,
}

impl Default for StampParams {
    fn default() -> Self {
        StampParams {
            edge_roughness: 0.45,
            jitter: 0.08,
        }
    }
}

/// Cells with coverage above this become wet when a stroke lands.
pub const WET_THRESHOLD: f32 = 1e-3;

/// How much paper height modulates the water a stroke lays down: a cell at
/// height `h` receives `1 + GAIN * (0.5 - h) * 2` times the nominal water, so
/// valleys start deeper and pooling begins at the stroke itself.
pub const STROKE_WATER_PAPER_GAIN: f32 = 0.5;

pub fn stroke_water_factor(paper_height: f32) -> f32 {
    (1.0 + STROKE_WATER_PAPER_GAIN * (0.5 - paper_height) * 2.0).max(0.0)
}

/// The grid a stamp is rasterised for, with its paper height for edge break-up.
#[derive(Debug, Clone, Copy)]
pub struct StampTarget<'a> {
    pub width: u32,
    pub height: u32,
    pub paper_height: &'a [f32],
}

/// [`rasterize_path_aspect`] for a square output.
pub fn rasterize_path(
    path: &[Point],
    radius: RadiusProfile,
    softness: f32,
    target: StampTarget<'_>,
    seed: Seed,
    params: StampParams,
) -> Stamp {
    rasterize_path_aspect(path, radius, softness, target, 1.0, seed, params)
}

/// Rasterises a capsule stroke along `path`. Positions are normalised scene
/// coordinates; `radius` (and the paper-driven edge shift) are measured in
/// the isotropic metric of an output with `aspect` (see
/// [`isotropic_scale`]), so a stamp is round after the grid is stretched.
pub fn rasterize_path_aspect(
    path: &[Point],
    radius: RadiusProfile,
    softness: f32,
    target: StampTarget<'_>,
    aspect: f32,
    seed: Seed,
    params: StampParams,
) -> Stamp {
    let StampTarget {
        width,
        height,
        paper_height,
    } = target;
    let n = (width as usize) * (height as usize);
    let mut coverage = vec![0.0f32; n];
    if path.is_empty() {
        return Stamp {
            width,
            height,
            coverage,
        };
    }
    let (w, h) = (width as f32, height as f32);
    let (ax, ay) = isotropic_scale(aspect);
    let iso = |p: &Point| Point::new(p.x * ax, p.y * ay);
    let segments: Vec<(Point, Point)> = if path.len() == 1 {
        vec![(iso(&path[0]), iso(&path[0]))]
    } else {
        path.windows(2).map(|p| (iso(&p[0]), iso(&p[1]))).collect()
    };
    let total_len: f32 = segments
        .iter()
        .map(|(a, b)| ((b.x - a.x).powi(2) + (b.y - a.y).powi(2)).sqrt())
        .sum::<f32>()
        .max(1e-6);
    let inner = 1.0 - softness.clamp(0.0, 1.0);
    let r_max = radius.max().max(1e-4) * (1.0 + params.jitter + params.edge_roughness);
    // A cell's size in the isotropic metric, for the anti-aliasing ramp.
    let cell = (ax / w).max(ay / h);
    let mut walked = 0.0f32;
    for (si, (a, b)) in segments.iter().enumerate() {
        let seg_len = ((b.x - a.x).powi(2) + (b.y - a.y).powi(2)).sqrt();
        let t0 = walked / total_len;
        let t1 = (walked + seg_len) / total_len;
        walked += seg_len;
        // Bounding box back in grid cells: the isotropic radius spans
        // r/ax of the width and r/ay of the height.
        let x_min = (((a.x.min(b.x) - r_max) / ax * w).floor().max(0.0)) as u32;
        let x_max = (((a.x.max(b.x) + r_max) / ax * w).ceil().min(w)) as u32;
        let y_min = (((a.y.min(b.y) - r_max) / ay * h).floor().max(0.0)) as u32;
        let y_max = (((a.y.max(b.y) + r_max) / ay * h).ceil().min(h)) as u32;
        for y in y_min..y_max {
            for x in x_min..x_max {
                let pu = (x as f32 + 0.5) / w * ax;
                let pv = (y as f32 + 0.5) / h * ay;
                let (dist, along) = distance_to_segment(pu, pv, *a, *b);
                let t = t0 + (t1 - t0) * along;
                let jitter =
                    1.0 + params.jitter * (hash2(seed.0, (t * 64.0) as i32, si as i32) * 2.0 - 1.0);
                let r = (radius.at(t) * jitter).max(1e-5);
                let idx = (y as usize) * (width as usize) + x as usize;
                let grain = paper_height.get(idx).copied().unwrap_or(0.5) - 0.5;
                let shifted = dist + grain * params.edge_roughness * r;
                let aa = 0.75 * cell / r;
                let cov = falloff(shifted / r, inner.min(1.0 - aa));
                if cov > coverage[idx] {
                    coverage[idx] = cov;
                }
            }
        }
    }
    Stamp {
        width,
        height,
        coverage,
    }
}

fn falloff(x: f32, inner: f32) -> f32 {
    if x <= inner {
        1.0
    } else if x >= 1.0 {
        0.0
    } else {
        let t = (x - inner) / (1.0 - inner).max(1e-5);
        1.0 - t * t * (3.0 - 2.0 * t)
    }
}

/// Distance from `(px, py)` to segment `ab` and the parameter along it.
fn distance_to_segment(px: f32, py: f32, a: Point, b: Point) -> (f32, f32) {
    let abx = b.x - a.x;
    let aby = b.y - a.y;
    let len2 = abx * abx + aby * aby;
    let t = if len2 < 1e-12 {
        0.0
    } else {
        (((px - a.x) * abx + (py - a.y) * aby) / len2).clamp(0.0, 1.0)
    };
    let cx = a.x + abx * t;
    let cy = a.y + aby * t;
    (((px - cx).powi(2) + (py - cy).powi(2)).sqrt(), t)
}

/// [`rasterize_mask_aspect`] for a square output.
pub fn rasterize_mask(mask: &Mask, width: u32, height: u32) -> Vec<f32> {
    rasterize_mask_aspect(mask, width, height, 1.0)
}

/// Bleed mask field for `Operation::SetMask`; see [`Mask`]. The inside test
/// uses normalised coordinates; feather and path radius are measured in the
/// isotropic metric of an output with `aspect` (see [`isotropic_scale`]).
pub fn rasterize_mask_aspect(mask: &Mask, width: u32, height: u32, aspect: f32) -> Vec<f32> {
    let n = (width as usize) * (height as usize);
    let mut out = vec![0.0f32; n];
    let (w, h) = (width as f32, height as f32);
    let (ax, ay) = isotropic_scale(aspect);
    let iso_points: Vec<Point> = mask
        .points()
        .iter()
        .map(|p| Point::new(p.x * ax, p.y * ay))
        .collect();
    for y in 0..height {
        for x in 0..width {
            let pu = (x as f32 + 0.5) / w;
            let pv = (y as f32 + 0.5) / h;
            let (iu, iv) = (pu * ax, pv * ay);
            let outside = match mask {
                Mask::Polygon { points, .. } => {
                    if point_in_polygon(pu, pv, points) {
                        0.0
                    } else {
                        polyline_distance(iu, iv, &iso_points, true)
                    }
                }
                Mask::Path { radius, .. } => {
                    (polyline_distance(iu, iv, &iso_points, false) - radius).max(0.0)
                }
            };
            let feather = mask.feather();
            let m = if outside <= 0.0 {
                1.0
            } else if feather <= 1e-6 {
                0.0
            } else {
                let t = (outside / feather).min(1.0);
                1.0 - t * t * (3.0 - 2.0 * t)
            };
            out[(y as usize) * (width as usize) + x as usize] = m;
        }
    }
    out
}

fn polyline_distance(px: f32, py: f32, points: &[Point], closed: bool) -> f32 {
    if points.is_empty() {
        return f32::MAX;
    }
    if points.len() == 1 {
        return distance_to_segment(px, py, points[0], points[0]).0;
    }
    let mut best = f32::MAX;
    for pair in points.windows(2) {
        best = best.min(distance_to_segment(px, py, pair[0], pair[1]).0);
    }
    if closed {
        best = best.min(distance_to_segment(px, py, points[points.len() - 1], points[0]).0);
    }
    best
}

fn point_in_polygon(px: f32, py: f32, points: &[Point]) -> bool {
    let mut inside = false;
    let n = points.len();
    if n < 3 {
        return false;
    }
    let mut j = n - 1;
    for i in 0..n {
        let (a, b) = (points[i], points[j]);
        if (a.y > py) != (b.y > py) {
            let x_at = a.x + (py - a.y) / (b.y - a.y) * (b.x - a.x);
            if px < x_at {
                inside = !inside;
            }
        }
        j = i;
    }
    inside
}

pub fn apply_brush(grid: &mut SimulationGrid, stamp: &Stamp, stroke: &BrushStroke) {
    let n = grid.cell_count();
    let k = stroke.pigment.min(grid.pigment_count.saturating_sub(1));
    for i in 0..n {
        let cov = stamp.coverage[i] * grid.bleed_mask[i];
        if cov <= 0.0 {
            continue;
        }
        let water = stroke.water * cov * stroke_water_factor(grid.paper_height[i]);
        grid.pressure[i] += water;
        grid.pigments_in_water[k * n + i] += stroke.concentration * cov;
        if water > WET_THRESHOLD || grid.pressure[i] > WET_THRESHOLD {
            grid.wet[i] = 1.0;
        }
    }
}

pub fn apply_water(grid: &mut SimulationGrid, stamp: &Stamp, stroke: &WaterStroke) {
    let n = grid.cell_count();
    for i in 0..n {
        let cov = stamp.coverage[i] * grid.bleed_mask[i];
        if cov <= 0.0 {
            continue;
        }
        grid.pressure[i] += stroke.water * cov * stroke_water_factor(grid.paper_height[i]);
        if grid.pressure[i] > WET_THRESHOLD {
            grid.wet[i] = 1.0;
        }
    }
}

pub fn apply_lift(grid: &mut SimulationGrid, stamp: &Stamp, stroke: &LiftStroke) {
    let n = grid.cell_count();
    for i in 0..n {
        let f = (1.0 - stroke.strength * stamp.coverage[i]).clamp(0.0, 1.0);
        if f >= 1.0 {
            continue;
        }
        grid.pressure[i] *= f;
        for k in 0..grid.pigment_count {
            grid.pigments_in_water[k * n + i] *= f;
            grid.pigments_deposited[k * n + i] *= f;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disc_stamp_is_full_at_centre_and_empty_far_away() {
        let flat = vec![0.5f32; 64 * 64];
        let s = rasterize_path(
            &[Point::new(0.5, 0.5)],
            RadiusProfile::uniform(0.2),
            0.5,
            StampTarget {
                width: 64,
                height: 64,
                paper_height: &flat,
            },
            Seed(1),
            StampParams::default(),
        );
        assert!(s.coverage[32 * 64 + 32] > 0.99);
        assert_eq!(s.coverage[0], 0.0);
    }

    /// Extent of the covered cells along each grid axis, in cells.
    fn extent(stamp: &Stamp) -> (usize, usize) {
        let w = stamp.width as usize;
        let mut cols = vec![false; w];
        let mut rows = vec![false; stamp.height as usize];
        for (i, &c) in stamp.coverage.iter().enumerate() {
            if c > 0.5 {
                cols[i % w] = true;
                rows[i / w] = true;
            }
        }
        (
            cols.iter().filter(|c| **c).count(),
            rows.iter().filter(|r| **r).count(),
        )
    }

    #[test]
    fn disc_on_a_four_to_one_scene_is_round_after_the_stretch() {
        let flat = vec![0.5f32; 128 * 128];
        let target = StampTarget {
            width: 128,
            height: 128,
            paper_height: &flat,
        };
        let params = StampParams {
            edge_roughness: 0.0,
            jitter: 0.0,
        };
        let disc = |aspect: f32| {
            rasterize_path_aspect(
                &[Point::new(0.5, 0.5)],
                RadiusProfile::uniform(0.1),
                0.0,
                target,
                aspect,
                Seed(1),
                params,
            )
        };
        let (cx, cy) = extent(&disc(4.0));
        // On the 4:1 output a grid cell is four times wider than it is tall,
        // so equal extents in scene units mean a 1:4 ratio in cells.
        let (ex, ey) = (cx as f32 * 4.0 / 128.0, cy as f32 / 128.0);
        assert!(
            (ex / ey - 1.0).abs() < 0.15,
            "extents in scene units {ex} vs {ey}"
        );
        assert!((ey - 0.2).abs() < 0.03, "diameter {ey}");
        let (sx, sy) = extent(&disc(1.0));
        assert_eq!(sx, sy);
        assert!(cx * 3 < sx);
    }

    #[test]
    fn mask_feather_is_isotropic_on_a_four_to_one_scene() {
        let m = Mask::Path {
            points: vec![Point::new(0.5, 0.5)],
            radius: 0.05,
            feather: 0.1,
        };
        let f = rasterize_mask_aspect(&m, 128, 128, 4.0);
        let centre = 64 * 128 + 64;
        let along_x = (0..64).take_while(|d| f[centre + d] > 0.0).count() as f32 * 4.0 / 128.0;
        let along_y = (0..64).take_while(|d| f[centre + d * 128] > 0.0).count() as f32 / 128.0;
        assert!(
            (along_x / along_y - 1.0).abs() < 0.2,
            "{along_x} vs {along_y}"
        );
    }

    #[test]
    fn polygon_mask_is_one_inside_and_feathers_outside() {
        let m = Mask::Polygon {
            points: vec![
                Point::new(0.25, 0.25),
                Point::new(0.75, 0.25),
                Point::new(0.75, 0.75),
                Point::new(0.25, 0.75),
            ],
            feather: 0.1,
        };
        let f = rasterize_mask(&m, 64, 64);
        assert_eq!(f[32 * 64 + 32], 1.0);
        let just_outside = f[32 * 64 + 50];
        assert!(just_outside > 0.0 && just_outside < 1.0);
        assert_eq!(f[0], 0.0);
    }
}
