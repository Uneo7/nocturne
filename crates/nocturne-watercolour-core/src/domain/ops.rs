//! Painting operations. Geometry is in normalised scene coordinates
//! (`0..1` on both axes) so a scene is independent of simulation and output
//! resolution.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

impl Point {
    pub const fn new(x: f32, y: f32) -> Self {
        Point { x, y }
    }
}

/// Brush radius interpolated linearly from the first path point to the last,
/// in normalised units.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RadiusProfile {
    pub start: f32,
    pub end: f32,
}

impl RadiusProfile {
    pub const fn uniform(r: f32) -> Self {
        RadiusProfile { start: r, end: r }
    }

    pub fn at(&self, t: f32) -> f32 {
        self.start + (self.end - self.start) * t.clamp(0.0, 1.0)
    }

    pub fn max(&self) -> f32 {
        self.start.max(self.end)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct BrushStroke {
    pub path: Vec<Point>,
    pub radius: RadiusProfile,
    /// Index into the scene palette.
    pub pigment: usize,
    /// Pigment concentration added per fully covered cell.
    pub concentration: f32,
    /// Water depth added per fully covered cell.
    pub water: f32,
    /// `0` is a hard-edged stamp, `1` fades from the centre line.
    pub softness: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WaterStroke {
    pub path: Vec<Point>,
    pub radius: RadiusProfile,
    pub water: f32,
    pub softness: f32,
}

/// Removes pigment (suspended and deposited) and water under the stroke.
#[derive(Debug, Clone, PartialEq)]
pub struct LiftStroke {
    pub path: Vec<Point>,
    pub radius: RadiusProfile,
    /// Fraction removed per fully covered cell.
    pub strength: f32,
    pub softness: f32,
}

/// Region paint may occupy. Inside the shape the mask is `1`; outside it falls
/// to `0` over `feather` (normalised units), and water beyond the mask
/// evaporates in proportion, so `feather` controls how far a wash may bleed
/// past its intended edge.
#[derive(Debug, Clone, PartialEq)]
pub enum Mask {
    Polygon {
        points: Vec<Point>,
        feather: f32,
    },
    Path {
        points: Vec<Point>,
        radius: f32,
        feather: f32,
    },
}

impl Mask {
    pub fn points(&self) -> &[Point] {
        match self {
            Mask::Polygon { points, .. } | Mask::Path { points, .. } => points,
        }
    }

    pub fn feather(&self) -> f32 {
        match self {
            Mask::Polygon { feather, .. } | Mask::Path { feather, .. } => *feather,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Operation {
    Brush(BrushStroke),
    Water(WaterStroke),
    Lift(LiftStroke),
    /// Scales evaporation from this point on; `1.0` is the base rate.
    Dry {
        rate: f32,
    },
    /// Instantly settles every suspended pigment and removes all water.
    DryAll,
    SetMask(Mask),
    ClearMask,
}

impl Operation {
    pub fn path(&self) -> Option<&[Point]> {
        match self {
            Operation::Brush(s) => Some(&s.path),
            Operation::Water(s) => Some(&s.path),
            Operation::Lift(s) => Some(&s.path),
            Operation::SetMask(m) => Some(m.points()),
            Operation::Dry { .. } | Operation::DryAll | Operation::ClearMask => None,
        }
    }
}
