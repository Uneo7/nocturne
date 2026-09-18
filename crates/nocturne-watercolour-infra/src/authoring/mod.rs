//! Artwork catalogue: named scene constructors. Every artwork is a function
//! of a seed, a palette, an intensity and a [`DetailLevel`]; the ids in
//! [`ArtworkCatalogue::IDS`] match the TypeScript union the web package
//! exposes.

mod accents;
mod geometry;
mod icons;
mod scenes;

use nocturne_watercolour_core::domain::scene::{MAX_CONCENTRATION, MAX_WATER};
use nocturne_watercolour_core::domain::seed::SeedStream;
use nocturne_watercolour_core::domain::{
    Background, BrushStroke, LiftStroke, Mask, Operation, Palette, Paper, PigmentRole, Point,
    RadiusProfile, Scene, SceneId, Seed, SimResolution, SizeHint, SubSeed, Timeline, WaterStroke,
};

pub use scenes::{glaze_pair, wash};

pub type ArtworkFn = fn(Seed, Palette) -> Scene;

pub struct ArtworkEntry {
    pub name: &'static str,
    pub build: ArtworkFn,
}

/// How much of an artwork to draw. Chosen from the size it will be shown at:
/// a 32-48 px icon cannot carry secondary strokes, and a 96-192 px one only
/// some of them. The simulation grid scales with it so small accents are
/// cheap; fewer ticks suffice on a coarser grid because water covers more of
/// the sheet per tick. `ExtraLarge` is the tier for a large backing store
/// (the web package derives it from the canvas's DPR-scaled long edge).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DetailLevel {
    Small,
    Medium,
    Large,
    ExtraLarge,
}

impl DetailLevel {
    pub const ALL: [DetailLevel; 4] = [
        DetailLevel::Small,
        DetailLevel::Medium,
        DetailLevel::Large,
        DetailLevel::ExtraLarge,
    ];

    pub fn sim_resolution(self) -> u32 {
        match self {
            DetailLevel::Small => 96,
            DetailLevel::Medium => 160,
            DetailLevel::Large => 256,
            DetailLevel::ExtraLarge => 384,
        }
    }

    fn tick_scale(self) -> f32 {
        match self {
            DetailLevel::Small => 0.5,
            DetailLevel::Medium => 0.75,
            DetailLevel::Large => 1.0,
            DetailLevel::ExtraLarge => 1.25,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            DetailLevel::Small => "small",
            DetailLevel::Medium => "medium",
            DetailLevel::Large => "large",
            DetailLevel::ExtraLarge => "extralarge",
        }
    }
}

pub struct ArtworkCatalogue;

impl ArtworkCatalogue {
    /// Every artwork the web package can ask for, hero icons first, then
    /// scenes, then accents.
    pub const IDS: &'static [&'static str] = &[
        "crescent-moon",
        "alarm-bell",
        "linked-rings",
        "report-pages",
        "magnifying-glass",
        "confirmation-mark",
        "moonlit-shoreline",
        "distant-mountains",
        "connected-shores",
        "overlapping-shapes",
        "avatar-wash",
        "tab-underline",
        "selection-edge",
        "confirmation-background",
        "header-motif",
    ];

    pub fn ids() -> &'static [&'static str] {
        Self::IDS
    }

    /// `by_id_for` on a light ground.
    pub fn by_id(
        id: &str,
        seed: Seed,
        palette: &Palette,
        intensity: f32,
        detail: DetailLevel,
    ) -> Option<Scene> {
        Self::by_id_for(
            id,
            seed,
            palette,
            intensity,
            detail,
            Background::Transparent,
        )
    }

    /// `intensity` (`0..1`, `0.7` is the designed look) scales pigment
    /// concentration and, more gently, the water each stroke lays down, so
    /// higher values also pool and rim harder. `background` is both stored on
    /// the scene and consulted while authoring: under
    /// `Background::TransparentOnDark` (luminous compositing) a shadow glaze
    /// inside a glow shape greys it and a tint over clear paper reads as a
    /// slab, so those marks are left out.
    pub fn by_id_for(
        id: &str,
        seed: Seed,
        palette: &Palette,
        intensity: f32,
        detail: DetailLevel,
        background: Background,
    ) -> Option<Scene> {
        Self::by_id_for_with_resolution(id, seed, palette, intensity, detail, background, None)
    }

    /// [`by_id_for`] with the simulation resolution overridden instead of the
    /// detail's default, so a large display can run a finer grid than the
    /// `ExtraLarge` 384 without re-authoring the scene. `sim_resolution` is
    /// clamped to `SimResolution::MIN..=SimResolution::MAX`; `None` keeps the
    /// detail default.
    pub fn by_id_for_with_resolution(
        id: &str,
        seed: Seed,
        palette: &Palette,
        intensity: f32,
        detail: DetailLevel,
        background: Background,
        sim_resolution: Option<u32>,
    ) -> Option<Scene> {
        let resolution = sim_resolution
            .map(|res| SimResolution(res.clamp(SimResolution::MIN, SimResolution::MAX)));
        let style = Style::new(seed, intensity, detail)
            .on(background)
            .with_resolution(resolution);
        let scene = match id {
            "crescent-moon" => icons::crescent_moon(&style, palette),
            "alarm-bell" => icons::alarm_bell(&style, palette),
            "linked-rings" => icons::linked_rings(&style, palette),
            "report-pages" => icons::report_pages(&style, palette),
            "magnifying-glass" => icons::magnifying_glass(&style, palette),
            "confirmation-mark" => icons::confirmation_mark(&style, palette),
            "moonlit-shoreline" => scenes::moonlit_shoreline(&style, palette),
            "distant-mountains" => scenes::distant_mountains(&style, palette),
            "connected-shores" => scenes::connected_shores(&style, palette),
            "overlapping-shapes" => scenes::overlapping_shapes(&style, palette),
            "avatar-wash" => accents::avatar_wash(&style, palette),
            "tab-underline" => accents::tab_underline(&style, palette),
            "selection-edge" => accents::selection_edge(&style, palette),
            "confirmation-background" => accents::confirmation_background(&style, palette),
            "header-motif" => accents::header_motif(&style, palette),
            _ => return None,
        };
        Some(scene)
    }

    /// The original three constructors, kept for the callers that address
    /// artworks by underscore name; `by_id` is the catalogue proper.
    pub fn entries() -> Vec<ArtworkEntry> {
        vec![
            ArtworkEntry {
                name: "wash",
                build: wash,
            },
            ArtworkEntry {
                name: "crescent_moon",
                build: crescent_moon,
            },
            ArtworkEntry {
                name: "glaze_pair",
                build: glaze_pair,
            },
        ]
    }

    pub fn build(name: &str, seed: Seed, palette: Palette) -> Option<Scene> {
        Self::entries()
            .into_iter()
            .find(|e| e.name == name)
            .map(|e| (e.build)(seed, palette))
    }
}

/// `crescent-moon` at the designed intensity and full detail.
pub fn crescent_moon(seed: Seed, palette: Palette) -> Scene {
    icons::crescent_moon(
        &Style::new(seed, DEFAULT_INTENSITY, DetailLevel::Large),
        &palette,
    )
}

pub const DEFAULT_INTENSITY: f32 = 0.7;

/// Per-build knobs every artwork reads its amounts through.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Style {
    seed: Seed,
    intensity: f32,
    detail: DetailLevel,
    background: Background,
    /// Simulation grid override; `None` uses the detail default.
    resolution: Option<SimResolution>,
}

impl Style {
    pub fn new(seed: Seed, intensity: f32, detail: DetailLevel) -> Style {
        Style {
            seed,
            intensity: if intensity.is_finite() {
                intensity.clamp(0.0, 1.0)
            } else {
                DEFAULT_INTENSITY
            },
            detail,
            background: Background::Transparent,
            resolution: None,
        }
    }

    pub fn on(mut self, background: Background) -> Style {
        self.background = background;
        self
    }

    pub fn with_resolution(mut self, resolution: Option<SimResolution>) -> Style {
        self.resolution = resolution;
        self
    }

    pub fn seed(&self) -> Seed {
        self.seed
    }

    /// The artwork will be shown on a dark ground with luminous compositing.
    pub fn dark(&self) -> bool {
        self.background == Background::TransparentOnDark
    }

    /// Concentration for a stroke designed at `base` for intensity 0.7:
    /// 0.3 keeps two thirds of it, 1.0 adds a quarter.
    pub fn conc(&self, base: f32) -> f32 {
        (base * (0.4 + self.intensity * 0.857)).clamp(0.0, MAX_CONCENTRATION)
    }

    pub fn water(&self, base: f32) -> f32 {
        (base * (0.8 + self.intensity * 0.3)).clamp(0.0, MAX_WATER)
    }

    /// `(concentration, water)` for a glow-only shape such as a moon. Under
    /// luminous compositing the dips in a thin deposit let the dark ground
    /// through as grey clouding, so on a dark ground the shape is laid
    /// heavier and drier to keep the deposit high everywhere.
    pub fn glow(&self, conc: f32, water: f32) -> (f32, f32) {
        if self.dark() {
            (self.conc(conc * 1.5), self.water(water * 0.55))
        } else {
            (self.conc(conc), self.water(water))
        }
    }

    pub fn ticks(&self, large: u32) -> u32 {
        ((large as f32 * self.detail.tick_scale()).round() as u32).max(16)
    }

    /// Secondary strokes are drawn at Medium and above.
    pub fn fine(&self) -> bool {
        self.detail != DetailLevel::Small
    }

    /// Tertiary detail is drawn at Large and above.
    pub fn full(&self) -> bool {
        matches!(self.detail, DetailLevel::Large | DetailLevel::ExtraLarge)
    }

    /// An independent random stream for geometry decisions; `purpose` keeps
    /// two uses in one artwork from sharing a sequence.
    pub fn stream(&self, purpose: u32) -> SeedStream {
        self.seed
            .derive(SubSeed::Brush(0x4155_0000 | purpose))
            .stream()
    }

    pub fn resolution(&self) -> SimResolution {
        self.resolution
            .unwrap_or(SimResolution(self.detail.sim_resolution()))
    }

    pub fn scene(
        &self,
        id: &str,
        palette: &Palette,
        size: SizeHint,
        paper: Paper,
        timeline: Timeline,
    ) -> Scene {
        Scene {
            id: SceneId(format!("{id}-{}-{}", palette.name, self.seed.0)),
            size_hint: size,
            paper,
            palette: palette.clone(),
            timeline,
            seed: self.seed,
            sim_resolution: self.resolution(),
            background: self.background,
        }
    }
}

/// Timeline builder with explicit phases. `Reveal` handles one mask and one
/// wet-on-dry glaze pass; the catalogue's scenes stencil several shapes in
/// sequence, each dried before the next, so they schedule events directly.
pub(crate) struct Painting {
    timeline: Timeline,
    total: u32,
}

impl Painting {
    pub fn new(total: u32) -> Painting {
        let total = total.max(2);
        Painting {
            timeline: Timeline::new(total),
            total,
        }
    }

    fn tick(&self, f: f32) -> u32 {
        ((f.clamp(0.0, 1.0) * self.total as f32).round() as u32).min(self.total - 1)
    }

    pub fn at(&mut self, f: f32, op: Operation) -> &mut Self {
        self.timeline.push(self.tick(f), op);
        self
    }

    pub fn mask(&mut self, f: f32, points: Vec<Point>, feather: f32) -> &mut Self {
        self.at(f, Operation::SetMask(Mask::Polygon { points, feather }))
    }

    pub fn clear_mask(&mut self, f: f32) -> &mut Self {
        self.at(f, Operation::ClearMask)
    }

    /// Starts a wet-on-dry phase: everything so far is settled and the
    /// evaporation rate returns to base.
    pub fn dry(&mut self, f: f32) -> &mut Self {
        self.at(f, Operation::DryAll);
        self.at(f, Operation::Dry { rate: 1.0 })
    }

    pub fn settle(&mut self, f: f32, rate: f32) -> &mut Self {
        self.at(f, Operation::Dry { rate })
    }

    pub fn finish(mut self) -> Timeline {
        self.timeline.push(self.total, Operation::DryAll);
        self.timeline
    }
}

pub(crate) fn role(palette: &Palette, role: PigmentRole) -> usize {
    palette.index_of(role).unwrap_or(0)
}

/// Of `candidates`, the role whose pigment granulates most (a shore or a
/// rock wants texture, whatever hue the palette gives that role); the first
/// candidate when none is present.
pub(crate) fn granulating_role(palette: &Palette, candidates: &[PigmentRole]) -> usize {
    candidates
        .iter()
        .filter_map(|&r| palette.index_of(r))
        .max_by(|&a, &b| {
            let g = |i: usize| palette.pigment(i).map_or(0.0, |p| p.granulation);
            g(a).total_cmp(&g(b))
        })
        .unwrap_or_else(|| role(palette, candidates[0]))
}

pub(crate) fn brush(
    path: Vec<Point>,
    radius: f32,
    pigment: usize,
    concentration: f32,
    water: f32,
    softness: f32,
) -> Operation {
    Operation::Brush(BrushStroke {
        path,
        radius: RadiusProfile::uniform(radius),
        pigment,
        concentration,
        water,
        softness,
    })
}

pub(crate) fn tapered(
    path: Vec<Point>,
    radius: (f32, f32),
    pigment: usize,
    concentration: f32,
    water: f32,
    softness: f32,
) -> Operation {
    Operation::Brush(BrushStroke {
        path,
        radius: RadiusProfile {
            start: radius.0,
            end: radius.1,
        },
        pigment,
        concentration,
        water,
        softness,
    })
}

/// A damp brush drawn through wet paint: removes pigment and water under it.
pub(crate) fn lift(path: Vec<Point>, radius: f32, strength: f32, softness: f32) -> Operation {
    Operation::Lift(LiftStroke {
        path,
        radius: RadiusProfile::uniform(radius),
        strength,
        softness,
    })
}

pub(crate) fn water(path: Vec<Point>, radius: f32, amount: f32, softness: f32) -> Operation {
    Operation::Water(WaterStroke {
        path,
        radius: RadiusProfile::uniform(radius),
        water: amount,
        softness,
    })
}

pub(crate) const SQUARE: SizeHint = SizeHint {
    width: 512,
    height: 512,
};

#[cfg(test)]
mod tests {
    use super::*;
    use geometry::{Crescent, dist};

    #[test]
    fn every_legacy_entry_validates_for_every_palette() {
        for entry in ArtworkCatalogue::entries() {
            for name in Palette::NAMES {
                let scene = (entry.build)(Seed(1), Palette::by_name(name).unwrap());
                assert_eq!(scene.validate(), Ok(()), "{} / {name}", entry.name);
            }
        }
    }

    #[test]
    fn intensity_scales_amounts_within_bounds() {
        let lo = Style::new(Seed(1), 0.0, DetailLevel::Large);
        let hi = Style::new(Seed(1), 1.0, DetailLevel::Large);
        assert!(lo.conc(1.0) > 0.3 && lo.conc(1.0) < 0.5);
        assert!(hi.conc(1.0) > 1.2 && hi.conc(1.0) < 1.3);
        assert!(hi.conc(10.0) <= MAX_CONCENTRATION);
        assert!(hi.water(10.0) <= MAX_WATER);
        let nan = Style::new(Seed(1), f32::NAN, DetailLevel::Large);
        assert_eq!(nan.intensity, DEFAULT_INTENSITY);
    }

    #[test]
    fn painting_phases_land_in_order_and_end_dry() {
        let mut p = Painting::new(100);
        p.mask(0.0, vec![Point::new(0.0, 0.0)], 0.01)
            .dry(0.5)
            .at(0.5, Operation::ClearMask)
            .settle(0.8, 3.0);
        let t = p.finish();
        let ticks: Vec<u32> = t.events.iter().map(|e| e.at_tick).collect();
        assert_eq!(ticks, vec![0, 50, 50, 50, 80, 100]);
        assert_eq!(t.events[1].op, Operation::DryAll);
        assert_eq!(t.events[3].op, Operation::ClearMask);
        assert_eq!(t.events.last().unwrap().op, Operation::DryAll);
    }

    #[test]
    fn crescent_outline_is_a_closed_ring_of_two_arcs() {
        let c = Crescent::at(0.5, 0.5, 0.27, 0.5);
        let outline = c.outline(96);
        assert!(outline.len() > 20 && outline.len() < 192);
        let spine = c.spine(9);
        assert_eq!(spine.len(), 9);
        let mask = c.mask_outline(0.09, 96);
        assert_eq!(mask.len(), outline.len());
        assert!(mask.iter().any(|p| dist(*p, c.centre) > c.radius + 0.08));
        for p in c.concave_edge(0.3, 7) {
            assert!(dist(p, c.inner_centre) >= c.inner_radius - 1e-4);
        }
    }
}
