//! Kubelka-Munk optics and the reference renderer.
//!
//! # Layer model
//!
//! Every cell is one mixed layer: the pigments present contribute
//! `Kx = sum_k t_k K_k` and `Sx = sum_k t_k S_k` per channel, where `t_k` is
//! the pigment's thickness (deposited plus visible suspended pigment). With
//! `a = (Kx + Sx) / Sx`, `b = sqrt(a^2 - 1)` and `beta = b Sx`,
//!
//! ```text
//! c = a sinh(beta) + b cosh(beta)
//! R = sinh(beta) / c
//! T = b / c
//! ```
//!
//! Layers stack with Curtis's two-layer formula, top layer 1 over layer 2:
//! `R = R1 + T1^2 R2 / (1 - R1 R2)`, `T = T1 T2 / (1 - R1 R2)`.
//!
//! # Transparent output
//!
//! Standard "over" compositing wants one alpha per pixel, but a glaze's colour
//! lives in its per-channel transmittance: over white, channel `c` shows
//! `W_c = R_c + T_c^2 / (1 - R_c)` (reflectance plus the light that goes down,
//! reflects off the paper and comes back up, interreflections included). The
//! layer is exported as
//!
//! ```text
//! return_c = T_c^2 / (1 - R_c)
//! alpha    = 1 - lerp(min_c(return_c), mean_c(return_c), ALPHA_SOFTNESS)
//! rgb_c    = max(0, W_c - (1 - alpha))            (premultiplied)
//! ```
//!
//! With `ALPHA_SOFTNESS = 0` this composites exactly to `W_c` over white for
//! every channel. The softness pulls alpha toward the mean transmittance so
//! a medium-thickness wash stays translucent over a dark ground instead of
//! saturating as soon as one channel is absorbed; the cost is that over
//! white the most-absorbed channel can come out brighter than `W_c` by at
//! most `ALPHA_SOFTNESS * (mean - min)` (a slight loss of saturation in
//! strongly chromatic glazes). Over black the result is
//! `R_c + return_c - (1 - alpha)`, brighter than the physical `R_c` in the
//! transmitting channels; over mid tones the interreflection term
//! `1 / (1 - R B)` is not background-aware. The errors are stated by
//! [`tests::alpha_conversion_matches_km_for_thin_glaze`]. This is an
//! approximation chosen so the output reads as watercolour on light grounds
//! in any compositor, not a claim of physical accuracy. Output is linear RGB;
//! sRGB encoding belongs to the exporter.
//!
//! # Composite modes
//!
//! The above is [`CompositeMode::Subtractive`]. Under it a pale glaze over a
//! dark ground cannot glow: a thin yellow returns almost no light of its own,
//! so a gold crescent on a night ground is a matte olive slab. For dark hosts
//! [`CompositeMode::Luminous`] is a *display* choice, not physics: it keeps
//! the same coverage alpha but outputs the colour the layer would show on
//! white paper,
//!
//! ```text
//! coverage  = 1 - lerp(min_c(return_c), mean_c(return_c), ALPHA_SOFTNESS)   of the
//!             plain mix (pigment thickness before granulation modulation)
//! alpha     = smoothstep(LUMINOUS_ALPHA_TOE, LUMINOUS_ALPHA_FULL, coverage of the
//!             plain mix's *presence*: its 3x3-dilated thickness around each cell)
//! W_c       = on-white colour of the damped granulated mix at thickness
//!             max(t_plain, LUMINOUS_COLOUR_FLOOR)
//! rgb_c     = W_c * alpha                                                  (premultiplied)
//! ```
//!
//! where `t_plain` is the plain mix's total thickness and the granulated mix
//! is first damped toward the plain one,
//! `plain + (textured - plain) * LUMINOUS_GRAIN_STRENGTH`. Fine-scale texture
//! therefore lives in colour, not alpha: granulation darkens and saturates
//! `W` as gentle mottling inside a continuous glow instead of thinning alpha
//! and letting the ground show through as speckle, while alpha still falls
//! off with the plain thickness at the boundary and in the halo. The paper's
//! low-frequency pooling octaves are part of the same height field the
//! granulation term reads, so they are damped by the same factor in colour;
//! the pooling the simulation deposited (the plain thickness itself) is not. Over a dark ground the
//! wash shows its on-white colour softly, like a translucent light wash, and
//! `rgb <= alpha` always holds. Two display decisions are folded in. The
//! alpha curve exists because the subtractive coverage is optical density,
//! which stays small for a pale pigment even at full thickness (moon gold:
//! 0.45 at thickness 1) and dips wherever the deposit carries paper tooth;
//! a display alpha has to read pigment presence and be flat across the
//! body, so coverage is mapped through a smoothstep that reaches 1 at
//! `LUMINOUS_ALPHA_FULL` (0.2) and is 0 below `LUMINOUS_ALPHA_TOE` (0.03),
//! with the smoothstep's gentle toe in between so halos and soft edges,
//! whose coverage falls through that band, still fade. The alpha reads the
//! plain thickness dilated by a 3x3 maximum over simulation cells
//! (`Sample::presence`): a wash's deposit has genuine pinholes where the
//! paper tooth left cells almost bare, and per-pixel alpha would open each
//! of them onto the ground as a dark pit; presence closes anything smaller
//! than a cell while moving a boundary outward by at most one cell. The colour is taken
//! at no less than `LUMINOUS_COLOUR_FLOOR` thickness because a very thin
//! glaze's on-white colour is nearly white, and white times a small alpha
//! over black is grey; above the floor the colour follows the deposited
//! thickness, so pooling and the deposit's fine tooth read as gentle
//! warm/pale mottling in colour, and overlaps darken further.
//! Over white it composites to `1 - alpha (1 - W_c)`: for a thin glaze
//! (`alpha` small) both modes are close to white and agree; for a dense
//! dark glaze on white Luminous is visibly washed out, and for a medium one
//! it is more saturated than the subtractive result because `W_c` is the
//! full-strength colour. That mismatch is why it is a per-scene choice
//! (`Background::TransparentOnDark`) and not the default. Pair it with the
//! normal palettes: `Palette::for_dark_surface` thins and pales pigments to
//! glow under Subtractive, which under Luminous only lowers alpha and drains
//! the on-white colour toward white.
//!
//! # Reconstruction
//!
//! The per-cell deposit and suspended-pigment fields are hard-edged once a
//! wash dries (each cell holds its own pigment), so bilinear reconstruction
//! over a sim grid coarser than the output shows the cell grid as two-pixel
//! staircases. The renderer instead reconstructs every field with a uniform
//! cubic B-spline: 4 by 4 taps around the sample position with weights
//!
//! ```text
//! w(-1) = (1 - t)^3 / 6
//! w(0)  = (3 t^3 - 6 t^2 + 4) / 6
//! w(+1) = (-3 t^3 + 3 t^2 + 3 t + 1) / 6
//! w(+2) = t^3 / 6
//! ```
//!
//! All weights are non-negative and sum to 1, so the filter is a convex
//! combination: reconstructed fields never go negative or overshoot, and the
//! premultiplied invariant (`rgb <= alpha`) holds exactly as before. At the
//! grid edge the out-of-bounds taps read the edge cell, which keeps the
//! weights summing to 1. The cost is four times the cell reads of the
//! previous bilinear: 16 taps instead of 4, each a separate storage read.
//! The Luminous presence semantics are unchanged (a 3x3 maximum of
//! `deposited + suspended * visibility * wet` around each tap, blended with
//! the same weights), but the maximum is now evaluated on all 16 taps, so
//! presence dilates by up to two cells instead of one; the pinhole-closing
//! property is untouched. `render.wgsl` is the lockstep port: both sides
//! evaluate the same taps in the same order.

use super::grid::SimulationGrid;
use super::image::Image;
use super::palette::Palette;
use super::paper::PaperField;
use super::pigment::Rgb;

/// Upper bound on `beta`; `cosh` overflows `f32` near 89 and `T` is already
/// below `1e-17` here.
const MAX_BETA: f32 = 40.0;

/// See the module doc, "Transparent output". Mirrored in `render.wgsl`.
pub const ALPHA_SOFTNESS: f32 = 0.6;

/// Plain-mix coverage below which the luminous alpha is 0 and at which it
/// reaches 1; see the module doc, "Composite modes". Mirrored in
/// `render.wgsl`.
pub const LUMINOUS_ALPHA_TOE: f32 = 0.03;
pub const LUMINOUS_ALPHA_FULL: f32 = 0.2;

/// Hermite smoothstep of `x` between `edge0` and `edge1`.
pub fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = ((x - edge0) / (edge1 - edge0).max(1e-6)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Smallest plain thickness the luminous colour is evaluated at; see the
/// module doc, "Composite modes". Mirrored in `render.wgsl`.
pub const LUMINOUS_COLOUR_FLOOR: f32 = 0.5;

/// How much of the granulation deviation reaches the luminous colour; `1`
/// is the full textured mix, `0` none. See the module doc, "Composite
/// modes". Mirrored in `render.wgsl`.
pub const LUMINOUS_GRAIN_STRENGTH: f32 = 0.38;

/// The Luminous display constants as one value, so probes can render
/// alternatives side by side. The shader only knows [`LUMINOUS_TUNING`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LuminousTuning {
    pub alpha_toe: f32,
    pub alpha_full: f32,
    pub colour_floor: f32,
    pub grain_strength: f32,
}

/// The shipped tuning; mirrored constant for constant in `render.wgsl`.
pub const LUMINOUS_TUNING: LuminousTuning = LuminousTuning {
    alpha_toe: LUMINOUS_ALPHA_TOE,
    alpha_full: LUMINOUS_ALPHA_FULL,
    colour_floor: LUMINOUS_COLOUR_FLOOR,
    grain_strength: LUMINOUS_GRAIN_STRENGTH,
};

/// How a layer's KM reflectance/transmittance becomes one premultiplied
/// pixel; see the module doc, "Composite modes".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CompositeMode {
    /// Physically motivated: exact over white (up to `ALPHA_SOFTNESS`), dim
    /// over dark. For light hosts.
    #[default]
    Subtractive,
    /// Display choice for dark hosts: the on-white colour at coverage alpha.
    Luminous,
}

impl CompositeMode {
    /// Encoding written into the simulation state header so the render
    /// shader can read it; mirrored in `render.wgsl`.
    pub fn flag(self) -> f32 {
        match self {
            CompositeMode::Subtractive => 0.0,
            CompositeMode::Luminous => 1.0,
        }
    }

    pub fn from_flag(flag: f32) -> CompositeMode {
        if flag > 0.5 {
            CompositeMode::Luminous
        } else {
            CompositeMode::Subtractive
        }
    }
}

/// Reflectance and transmittance of one channel of a layer with total
/// absorption `kx` and scattering `sx` (coefficients already multiplied by
/// thickness). `(0, 0)` is a clear layer: `(R, T) = (0, 1)`.
pub fn layer(kx: f32, sx: f32) -> (f32, f32) {
    let kx = kx.max(0.0);
    let sx = sx.max(0.0);
    if kx + sx <= 0.0 {
        return (0.0, 1.0);
    }
    let beta = (kx * kx + 2.0 * kx * sx).sqrt().min(MAX_BETA);
    // a/b and Sx sinh(beta)/beta stay finite as Sx -> 0 where a and b alone blow up.
    let a_over_b = if beta > 1e-12 { (kx + sx) / beta } else { 1.0 };
    let sinh_over_beta = if beta < 1e-4 {
        1.0 + beta * beta / 6.0
    } else {
        beta.sinh() / beta
    };
    let denom = a_over_b * beta.sinh() + beta.cosh();
    let r = sx * sinh_over_beta / denom;
    let t = 1.0 / denom;
    (r.clamp(0.0, 1.0), t.clamp(0.0, 1.0))
}

pub fn layer_rgb(k: Rgb, s: Rgb, thickness: f32) -> (Rgb, Rgb) {
    let mut r = [0.0; 3];
    let mut t = [0.0; 3];
    for c in 0..3 {
        let (rc, tc) = layer(k.0[c] * thickness, s.0[c] * thickness);
        r[c] = rc;
        t[c] = tc;
    }
    (Rgb(r), Rgb(t))
}

/// Totals of a mixed layer holding `thickness[k]` of each palette pigment.
pub fn mixed_totals(palette: &Palette, thickness: &[f32]) -> MixTotals {
    let mut kx = [0.0f32; 3];
    let mut sx = [0.0f32; 3];
    let mut total = 0.0;
    for (p, &t) in palette.pigments().zip(thickness) {
        let t = t.max(0.0);
        total += t;
        for c in 0..3 {
            kx[c] += p.k.0[c] * t;
            sx[c] += p.s.0[c] * t;
        }
    }
    MixTotals {
        kx: Rgb(kx),
        sx: Rgb(sx),
        thickness: total,
    }
}

/// One mixed layer holding `thickness[k]` of each palette pigment.
pub fn mixed_layer(palette: &Palette, thickness: &[f32]) -> (Rgb, Rgb) {
    let m = mixed_totals(palette, thickness);
    layer_rgb(m.kx, m.sx, 1.0)
}

/// Stacks `layers` (index 0 on top) over an opaque background with
/// reflectance `background`, returning the reflectance seen from above.
pub fn composite(layers: &[(Rgb, Rgb)], background: Rgb) -> Rgb {
    let mut r_below = background;
    for (r1, t1) in layers.iter().rev() {
        r_below = Rgb([0, 1, 2].map(|c| {
            let denom = (1.0 - r1.0[c] * r_below.0[c]).max(1e-6);
            r1.0[c] + t1.0[c] * t1.0[c] * r_below.0[c] / denom
        }));
    }
    r_below
}

/// Light returned through a layer from a white ground, per channel.
fn returned(r: Rgb, t: Rgb) -> Rgb {
    t.zip(r, |t, r| (t * t / (1.0 - r).max(1e-6)).clamp(0.0, 1.0))
}

/// `1 - lerp(min, mean, ALPHA_SOFTNESS)` of the returned light: the
/// subtractive coverage alpha.
fn coverage(r: Rgb, t: Rgb) -> f32 {
    let ret = returned(r, t);
    let min_return = ret.0[0].min(ret.0[1]).min(ret.0[2]);
    let passed = min_return + (ret.mean() - min_return) * ALPHA_SOFTNESS;
    (1.0 - passed).clamp(0.0, 1.0)
}

/// On-white colour of a layer, `R + T^2 / (1 - R)`.
pub fn over_white(r: Rgb, t: Rgb) -> Rgb {
    r.zip(returned(r, t), |r, ret| (r + ret).clamp(0.0, 1.0))
}

/// Subtractive premultiplied RGBA for standard "over" compositing; see the
/// module doc.
pub fn to_premultiplied(r: Rgb, t: Rgb) -> [f32; 4] {
    let alpha = coverage(r, t);
    let passed = 1.0 - alpha;
    let w = over_white(r, t);
    [
        (w.0[0] - passed).clamp(0.0, 1.0),
        (w.0[1] - passed).clamp(0.0, 1.0),
        (w.0[2] - passed).clamp(0.0, 1.0),
        alpha,
    ]
}

/// Totals of a mixed layer: absorption and scattering with thickness
/// multiplied in, and the thickness sum.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MixTotals {
    pub kx: Rgb,
    pub sx: Rgb,
    pub thickness: f32,
}

/// `plain + (textured - plain) * strength`, component-wise.
pub fn damp_texture(textured: MixTotals, plain: MixTotals, strength: f32) -> MixTotals {
    MixTotals {
        kx: plain.kx.zip(textured.kx, |p, t| p + (t - p) * strength),
        sx: plain.sx.zip(textured.sx, |p, t| p + (t - p) * strength),
        thickness: plain.thickness + (textured.thickness - plain.thickness) * strength,
    }
}

/// Luminous premultiplied RGBA; see the module doc, "Composite modes".
/// `textured` is the mix after granulation modulation (colour), `plain` the
/// same mix before it (colour reference thickness), `presence` the plain
/// mix dilated over the cell neighbourhood (alpha).
pub fn to_premultiplied_luminous(
    textured: MixTotals,
    plain: MixTotals,
    presence: MixTotals,
) -> [f32; 4] {
    to_premultiplied_luminous_tuned(textured, plain, presence, &LUMINOUS_TUNING)
}

/// [`to_premultiplied_luminous`] with an explicit grain strength, for
/// side-by-side probes; the shader only knows the constant.
pub fn to_premultiplied_luminous_with_strength(
    textured: MixTotals,
    plain: MixTotals,
    presence: MixTotals,
    grain_strength: f32,
) -> [f32; 4] {
    let tuning = LuminousTuning {
        grain_strength,
        ..LUMINOUS_TUNING
    };
    to_premultiplied_luminous_tuned(textured, plain, presence, &tuning)
}

/// [`to_premultiplied_luminous`] with an explicit tuning.
pub fn to_premultiplied_luminous_tuned(
    textured: MixTotals,
    plain: MixTotals,
    presence: MixTotals,
    tuning: &LuminousTuning,
) -> [f32; 4] {
    let (r, t) = layer_rgb(presence.kx, presence.sx, 1.0);
    let alpha = smoothstep(tuning.alpha_toe, tuning.alpha_full, coverage(r, t));
    // Brings a layer thinner than the colour floor up to the floor.
    let scale = (tuning.colour_floor / plain.thickness.max(1e-6)).max(1.0);
    let damped = damp_texture(textured, plain, tuning.grain_strength);
    let (r_ref, t_ref) = layer_rgb(damped.kx, damped.sx, scale);
    let w = over_white(r_ref, t_ref);
    [w.0[0] * alpha, w.0[1] * alpha, w.0[2] * alpha, alpha]
}

/// Dispatches on the mode. Subtractive renders the textured mix as is;
/// Luminous splits texture into colour and dilated plain presence into alpha.
pub fn composite_pixel(
    textured: MixTotals,
    plain: MixTotals,
    presence: MixTotals,
    mode: CompositeMode,
) -> [f32; 4] {
    composite_pixel_with_strength(textured, plain, presence, mode, LUMINOUS_GRAIN_STRENGTH)
}

/// [`composite_pixel`] with an explicit luminous grain strength; Subtractive
/// ignores it and `presence`.
pub fn composite_pixel_with_strength(
    textured: MixTotals,
    plain: MixTotals,
    presence: MixTotals,
    mode: CompositeMode,
    grain_strength: f32,
) -> [f32; 4] {
    let tuning = LuminousTuning {
        grain_strength,
        ..LUMINOUS_TUNING
    };
    composite_pixel_tuned(textured, plain, presence, mode, &tuning)
}

/// [`composite_pixel`] with an explicit luminous tuning; Subtractive
/// ignores it and `presence`.
pub fn composite_pixel_tuned(
    textured: MixTotals,
    plain: MixTotals,
    presence: MixTotals,
    mode: CompositeMode,
    tuning: &LuminousTuning,
) -> [f32; 4] {
    match mode {
        CompositeMode::Subtractive => {
            let (r, t) = layer_rgb(textured.kx, textured.sx, 1.0);
            to_premultiplied(r, t)
        }
        CompositeMode::Luminous => {
            to_premultiplied_luminous_tuned(textured, plain, presence, tuning)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RenderParams {
    /// How strongly paper height at output resolution modulates thickness of
    /// granulating pigments.
    pub granulation_gain: f32,
    /// Fraction of suspended pigment that reads through the water film.
    pub wet_pigment_visibility: f32,
    /// KM thickness per unit of deposited pigment.
    pub thickness_scale: f32,
}

impl Default for RenderParams {
    fn default() -> Self {
        RenderParams {
            granulation_gain: 0.8,
            wet_pigment_visibility: 0.85,
            thickness_scale: 1.0,
        }
    }
}

/// Renders the grid to `paper_out`'s resolution, reconstructing the sim
/// fields with the cubic B-spline filter described in the module doc and
/// sampling the paper height at full output resolution so granulation keeps
/// its texture regardless of sim resolution. The paper field is generated at
/// the output's pixel scale (see `paper::generate_with_pixel_scale`), which
/// band-limits octaves finer than a few output pixels so the granulation
/// never reads as per-pixel speckle. The composite mode is the grid's
/// (`SimulationGrid::composite_mode`), so every backend reads it from the
/// same state.
pub fn render(
    grid: &SimulationGrid,
    palette: &Palette,
    paper_out: &PaperField,
    params: &RenderParams,
) -> Image {
    render_with_grain_strength(grid, palette, paper_out, params, LUMINOUS_GRAIN_STRENGTH)
}

/// [`render`] with an explicit `LUMINOUS_GRAIN_STRENGTH` override, for probes
/// that compare strengths side by side. Subtractive output is unaffected.
pub fn render_with_grain_strength(
    grid: &SimulationGrid,
    palette: &Palette,
    paper_out: &PaperField,
    params: &RenderParams,
    grain_strength: f32,
) -> Image {
    let tuning = LuminousTuning {
        grain_strength,
        ..LUMINOUS_TUNING
    };
    render_with_luminous_tuning(grid, palette, paper_out, params, &tuning)
}

/// [`render`] with an explicit luminous tuning, for side-by-side probes.
/// Subtractive output is unaffected.
pub fn render_with_luminous_tuning(
    grid: &SimulationGrid,
    palette: &Palette,
    paper_out: &PaperField,
    params: &RenderParams,
    tuning: &LuminousTuning,
) -> Image {
    let (ow, oh) = (paper_out.width, paper_out.height_px);
    let mut image = Image::new(ow, oh);
    let k_count = grid.pigment_count.min(palette.len());
    let mut thickness = vec![0.0f32; k_count];
    let mut plain = vec![0.0f32; k_count];
    let mut presence = vec![0.0f32; k_count];
    let gran: Vec<f32> = palette.pigments().map(|p| p.granulation).collect();
    for y in 0..oh {
        for x in 0..ow {
            let u = (x as f32 + 0.5) / ow as f32;
            let v = (y as f32 + 0.5) / oh as f32;
            let sample = cubic_sample(grid, u, v, params.wet_pigment_visibility);
            let h_out = paper_out.height[(y as usize) * (ow as usize) + x as usize];
            let wet = sample.wet;
            for k in 0..k_count {
                let base = sample.deposited[k]
                    + sample.suspended[k] * params.wet_pigment_visibility * wet.max(0.0);
                let grain = 1.0 + gran[k] * params.granulation_gain * (0.5 - h_out) * 2.0;
                plain[k] = (base * params.thickness_scale).max(0.0);
                thickness[k] = (plain[k] * grain.max(0.0)).max(0.0);
                presence[k] = (sample.presence[k] * params.thickness_scale).max(0.0);
            }
            let px = composite_pixel_tuned(
                mixed_totals(palette, &thickness),
                mixed_totals(palette, &plain),
                mixed_totals(palette, &presence),
                grid.composite_mode,
                tuning,
            );
            let o = ((y as usize) * (ow as usize) + x as usize) * 4;
            image.rgba[o..o + 4].copy_from_slice(&px);
        }
    }
    image
}

struct Sample {
    wet: f32,
    deposited: [f32; super::palette::MAX_PIGMENTS],
    suspended: [f32; super::palette::MAX_PIGMENTS],
    /// Per pigment, the cubic blend of each of the 4x4 taps' 3x3 maximum of
    /// `deposited + suspended * visibility * wet`; see the module doc.
    presence: [f32; super::palette::MAX_PIGMENTS],
}

/// The cubic B-spline weights for a fractional position `t in 0..1` between
/// sample points, for the four taps at `floor - 1 ..= floor + 2`. See the
/// module doc for the formula; all weights are in `0..1` and sum to 1.
fn cubic_weights(t: f32) -> [f32; 4] {
    let u = 1.0 - t;
    [
        u * u * u / 6.0,
        (3.0 * t * t * t - 6.0 * t * t + 4.0) / 6.0,
        (-3.0 * t * t * t + 3.0 * t * t + 3.0 * t + 1.0) / 6.0,
        t * t * t / 6.0,
    ]
}

/// Cubic B-spline sample at normalised `(u, v)`; the same lookup the shader
/// port performs on the sim buffers, evaluating the same 16 taps in the same
/// order.
fn cubic_sample(grid: &SimulationGrid, u: f32, v: f32, wet_visibility: f32) -> Sample {
    let w = grid.width as usize;
    let h = grid.height as usize;
    let fx = (u * w as f32 - 0.5).clamp(0.0, (w - 1) as f32);
    let fy = (v * h as f32 - 0.5).clamp(0.0, (h - 1) as f32);
    let x0 = fx.floor() as usize;
    let y0 = fy.floor() as usize;
    let tx = fx - x0 as f32;
    let ty = fy - y0 as f32;
    let wx = cubic_weights(tx);
    let wy = cubic_weights(ty);
    let n = grid.cell_count();
    let k_count = grid.pigment_count.min(super::palette::MAX_PIGMENTS);
    let mut out = Sample {
        wet: 0.0,
        deposited: [0.0; super::palette::MAX_PIGMENTS],
        suspended: [0.0; super::palette::MAX_PIGMENTS],
        presence: [0.0; super::palette::MAX_PIGMENTS],
    };
    let cell_presence = |k: usize, j: usize| {
        grid.pigments_deposited[k * n + j]
            + grid.pigments_in_water[k * n + j] * wet_visibility * grid.wet[j]
    };
    for (oy, &wyi) in wy.iter().enumerate() {
        let tap_y = y0 as isize + oy as isize - 1;
        let cy = tap_y.clamp(0, h as isize - 1) as usize;
        for (ox, &wxo) in wx.iter().enumerate() {
            let tap_x = x0 as isize + ox as isize - 1;
            let cx = tap_x.clamp(0, w as isize - 1) as usize;
            let wgt = wxo * wyi;
            let i = cy * w + cx;
            out.wet += grid.wet[i] * wgt;
            for k in 0..k_count {
                out.deposited[k] += grid.pigments_deposited[k * n + i] * wgt;
                out.suspended[k] += grid.pigments_in_water[k * n + i] * wgt;
                let mut best = 0.0f32;
                for dy in 0..3 {
                    for dx in 0..3 {
                        let nx = (tap_x + dx as isize - 1).clamp(0, w as isize - 1) as usize;
                        let ny = (tap_y + dy as isize - 1).clamp(0, h as isize - 1) as usize;
                        best = best.max(cell_presence(k, ny * w + nx));
                    }
                }
                out.presence[k] += best * wgt;
            }
        }
    }
    out
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::domain::pigment::{Pigment, builtin};

    #[test]
    fn zero_thickness_is_clear() {
        let (r, t) = layer(0.0, 0.0);
        assert_eq!((r, t), (0.0, 1.0));
        let (r, t) = layer_rgb(builtin::indigo().k, builtin::indigo().s, 0.0);
        assert_eq!(r, Rgb::new(0.0, 0.0, 0.0));
        assert_eq!(t, Rgb::new(1.0, 1.0, 1.0));
    }

    #[test]
    fn unit_thickness_over_white_recovers_design_reflectance() {
        let p = builtin::quinacridone_rose();
        let (r, t) = layer_rgb(p.k, p.s, 1.0);
        let over_white = composite(&[(r, t)], Rgb::new(1.0, 1.0, 1.0));
        for (c, expect) in over_white.0.iter().zip([0.72, 0.18, 0.36]) {
            assert!((c - expect).abs() < 0.02, "{c} vs {expect}");
        }
    }

    #[test]
    fn thick_layer_is_opaque_and_finite() {
        let p = builtin::lamp_black();
        let (r, t) = layer_rgb(p.k, p.s, 500.0);
        for c in 0..3 {
            assert!(r.0[c].is_finite() && t.0[c].is_finite());
            assert!(t.0[c] < 1e-6);
        }
    }

    fn totals(p: &Pigment, thickness: f32) -> MixTotals {
        MixTotals {
            kx: p.k.map(|k| k * thickness),
            sx: p.s.map(|s| s * thickness),
            thickness,
        }
    }

    /// Glaze thickness the alpha approximation is checked at.
    pub const THIN_GLAZE_THICKNESS: f32 = 0.15;
    /// Worst channel error over black across every built-in pigment at
    /// [`THIN_GLAZE_THICKNESS`]; over white the error is bounded per channel
    /// by `ALPHA_SOFTNESS * (mean - min)` of the returned light. The black
    /// error is the spread of per-channel transmittance folded into one
    /// alpha, largest for phthalo blue (red channel).
    pub const THIN_GLAZE_BLACK_TOLERANCE: f32 = 0.3;

    #[test]
    fn alpha_conversion_matches_km_for_thin_glaze() {
        let mut worst_black = 0.0f32;
        for p in builtin::all() {
            let (r, t) = layer_rgb(p.k, p.s, THIN_GLAZE_THICKNESS);
            let px = to_premultiplied(r, t);
            let white = Rgb::new(1.0, 1.0, 1.0);
            let exact_white = composite(&[(r, t)], white);
            let exact_black = composite(&[(r, t)], Rgb::new(0.0, 0.0, 0.0));
            let returned: Vec<f32> = (0..3)
                .map(|c| t.0[c] * t.0[c] / (1.0 - r.0[c]).max(1e-6))
                .collect();
            let min_ret = returned.iter().cloned().fold(f32::MAX, f32::min);
            let mean_ret = returned.iter().sum::<f32>() / 3.0;
            let white_bound = ALPHA_SOFTNESS * (mean_ret - min_ret) + 1e-4;
            for c in 0..3 {
                let over_white = px[c] + (1.0 - px[3]);
                let err = over_white - exact_white.0[c];
                assert!(
                    err >= -1e-4 && err <= white_bound,
                    "{} channel {c} over white: {over_white} vs {} (bound {white_bound})",
                    p.name,
                    exact_white.0[c]
                );
                let over_black = px[c];
                let err = (over_black - exact_black.0[c]).abs();
                worst_black = worst_black.max(err);
                assert!(
                    err < THIN_GLAZE_BLACK_TOLERANCE,
                    "{} channel {c} over black: {over_black} vs {}",
                    p.name,
                    exact_black.0[c]
                );
            }
        }
        eprintln!("worst over-black error at thin glaze: {worst_black}");
    }

    #[test]
    fn luminous_over_black_shows_the_on_white_colour_with_chroma() {
        // Over black the composited pixel is the premultiplied rgb = W * alpha,
        // so its chroma scales with coverage; the straight colour W carries the
        // hue itself. Both are checked: W at thickness 0.5, the pixel at 1.0.
        // The `for_dark_surface` variants are excluded on purpose: they are
        // built for Subtractive glow and their on-white colour is nearly white.
        let chroma = |rgb: [f32; 3]| {
            rgb.iter().cloned().fold(0.0, f32::max) - rgb.iter().cloned().fold(1.0, f32::min)
        };
        let pixel = |p: &Pigment, thickness: f32| {
            to_premultiplied_luminous(
                totals(p, thickness),
                totals(p, thickness),
                totals(p, thickness),
            )
        };
        let check = |p: &Pigment| {
            let px = pixel(p, 0.5);
            let straight = [px[0] / px[3], px[1] / px[3], px[2] / px[3]];
            let px1 = pixel(p, 1.0);
            eprintln!(
                "{}: straight W @0.5 {straight:?} (alpha {}), pixel @1.0 {:?}",
                p.name,
                px[3],
                &px1[..3]
            );
            assert!(chroma(straight) > 0.15, "{} straight chroma", p.name);
            assert!(
                chroma([px1[0], px1[1], px1[2]]) > 0.15,
                "{} pixel chroma",
                p.name
            );
        };
        check(&builtin::moon_gold());
        check(&builtin::quinacridone_rose());
        check(&builtin::phthalo_blue());
        check(&builtin::cerulean());
    }

    #[test]
    fn premultiplied_invariant_holds_in_both_modes() {
        for p in builtin::all() {
            for thickness in [0.02, 0.2, 0.6, 1.0, 3.0] {
                let textured = totals(&p, thickness * 1.4);
                let plain = totals(&p, thickness);
                for mode in [CompositeMode::Subtractive, CompositeMode::Luminous] {
                    let px = composite_pixel(textured, plain, plain, mode);
                    for c in 0..3 {
                        assert!(
                            px[c] <= px[3] + 1e-6,
                            "{} {mode:?} @ {thickness}: rgb {} > alpha {}",
                            p.name,
                            px[c],
                            px[3]
                        );
                        assert!(px[c] >= 0.0 && px[c].is_finite());
                    }
                }
            }
        }
    }

    #[test]
    fn luminous_matches_subtractive_over_white_for_thin_pale_layers() {
        let p = builtin::moon_gold();
        let m = totals(&p, 0.05);
        let sub = composite_pixel(m, m, m, CompositeMode::Subtractive);
        let lum = composite_pixel(m, m, m, CompositeMode::Luminous);
        for c in 0..3 {
            let over_white_sub = sub[c] + (1.0 - sub[3]);
            let over_white_lum = lum[c] + (1.0 - lum[3]);
            assert!(
                (over_white_sub - over_white_lum).abs() < 0.03,
                "channel {c}: {over_white_sub} vs {over_white_lum}"
            );
        }
    }

    #[test]
    fn luminous_alpha_is_flat_across_the_body_and_fades_at_the_edge() {
        let p = builtin::moon_gold();
        let alpha_at = |thickness: f32| {
            let m = totals(&p, thickness);
            composite_pixel(m, m, m, CompositeMode::Luminous)[3]
        };
        // Coverage of moon gold: ~0.03 at thickness 0.05, ~0.1 at 0.16,
        // ~0.26 at 0.5, ~0.45 at 1.
        assert!(alpha_at(0.02) < 0.05, "vanishing thickness fades out");
        let toe = alpha_at(0.16);
        assert!(toe > 0.05 && toe < 0.8, "halo band is partial: {toe}");
        assert_eq!(
            alpha_at(0.5),
            1.0,
            "body at half thickness is fully covered"
        );
        assert_eq!(alpha_at(1.0), 1.0);
        assert_eq!(alpha_at(3.0), 1.0);
        let mut prev = 0.0;
        for i in 0..=20 {
            let a = alpha_at(i as f32 * 0.05);
            assert!(a >= prev - 1e-6, "monotone");
            prev = a;
        }
    }

    #[test]
    fn luminous_colour_is_floored_for_thin_layers_and_darkens_with_thickness() {
        let p = builtin::quinacridone_rose();
        let straight = |thickness: f32| {
            let px = to_premultiplied_luminous(
                totals(&p, thickness),
                totals(&p, thickness),
                totals(&p, thickness),
            );
            [px[0] / px[3], px[1] / px[3], px[2] / px[3]]
        };
        let thin = straight(0.1);
        let at_floor = straight(LUMINOUS_COLOUR_FLOOR);
        let unit = straight(1.0);
        let dense = straight(2.5);
        for c in 0..3 {
            assert!(
                (thin[c] - at_floor[c]).abs() < 1e-4,
                "layers below the floor share the floor colour"
            );
        }
        let sum = |c: [f32; 3]| c.iter().sum::<f32>();
        assert!(sum(unit) < sum(at_floor), "pooling darkens above the floor");
        assert!(sum(dense) < sum(unit), "overlaps darken further");
    }

    #[test]
    fn luminous_texture_darkens_colour_but_leaves_alpha_alone() {
        let p = builtin::moon_gold();
        let plain = totals(&p, 0.4);
        let smooth = to_premultiplied_luminous(plain, plain, plain);
        let grainy = to_premultiplied_luminous(totals(&p, 0.4 * 1.5), plain, plain);
        let thin = to_premultiplied_luminous(totals(&p, 0.4 * 0.6), plain, plain);
        assert_eq!(smooth[3], grainy[3]);
        assert_eq!(smooth[3], thin[3]);
        let lum = |px: [f32; 4]| px[0] + px[1] + px[2];
        assert!(lum(grainy) < lum(smooth), "denser texture darkens");
        assert!(lum(thin) > lum(smooth), "sparser texture lightens");
        // The damping leaves the colour strictly between the smooth and the
        // fully textured result, in proportion to the strength.
        let full =
            to_premultiplied_luminous_with_strength(totals(&p, 0.4 * 1.5), plain, plain, 1.0);
        assert_eq!(full[3], grainy[3]);
        assert!(lum(full) < lum(grainy) && lum(grainy) < lum(smooth));
        let ratio = (lum(smooth) - lum(grainy)) / (lum(smooth) - lum(full));
        assert!(
            (ratio - LUMINOUS_GRAIN_STRENGTH).abs() < 0.12,
            "damping ratio {ratio} vs strength {LUMINOUS_GRAIN_STRENGTH}"
        );
        let sub_smooth = composite_pixel(plain, plain, plain, CompositeMode::Subtractive);
        let sub_grainy = composite_pixel(
            totals(&p, 0.4 * 1.5),
            plain,
            plain,
            CompositeMode::Subtractive,
        );
        assert_ne!(
            sub_smooth[3], sub_grainy[3],
            "subtractive still carries texture in alpha"
        );
    }

    #[test]
    fn luminous_presence_closes_pinholes_but_not_the_outside() {
        use crate::domain::{Paper, PaperField, Seed, SimulationGrid};
        let palette = Palette::moonlight();
        let field = PaperField::generate(&Paper::hot_press(Seed(1)), 32, 32);
        let mut grid = SimulationGrid::new(&field, palette.len());
        let n = grid.cell_count();
        for y in 8..24 {
            for x in 8..24 {
                grid.pigments_deposited[3 * n + y * 32 + x] = 0.6;
            }
        }
        grid.pigments_deposited[3 * n + 16 * 32 + 16] = 0.0;
        let params = RenderParams::default();
        let sub = render(&grid, &palette, &field, &params);
        let lum = render(
            &grid.clone().with_composite_mode(CompositeMode::Luminous),
            &palette,
            &field,
            &params,
        );
        let hole = lum.pixel(16, 16);
        assert!(
            hole[3] > 0.95,
            "pinhole is closed in luminous alpha: {}",
            hole[3]
        );
        // The cubic reconstruction smooths the single-cell hole in the
        // deposit to a thin spot (the 4/6-weight tap sits on the bare cell
        // against 1/6-weight taps on its 0.6 neighbours), so subtractive
        // keeps it as a visible dip rather than a full hole.
        assert!(
            sub.pixel(16, 16)[3] < sub.pixel(10, 10)[3] - 0.05,
            "subtractive keeps the pinhole as a dip"
        );
        assert_eq!(lum.pixel(2, 2)[3], 0.0, "outside stays transparent");
        assert!(
            lum.pixel(4, 16)[3] < 0.05,
            "four cells outside the body stays transparent"
        );
    }

    #[test]
    fn cubic_weights_are_a_partition_of_unity() {
        for t in [0.0, 0.125, 0.25, 0.375, 0.5, 0.75, 0.999] {
            let w = cubic_weights(t);
            assert!(w.iter().all(|&x| x >= 0.0), "non-negative at {t}: {w:?}");
            let sum: f32 = w.iter().sum();
            assert!((sum - 1.0).abs() < 1e-5, "weights sum to 1 at {t}: {sum}");
        }
    }

    #[test]
    fn cubic_reconstruction_recovers_a_constant_field() {
        use crate::domain::{Paper, PaperField, Seed, SimulationGrid};
        let palette = Palette::water();
        let field = PaperField::generate(&Paper::hot_press(Seed(2)), 16, 16);
        let mut grid = SimulationGrid::new(&field, palette.len());
        for i in 0..grid.cell_count() {
            grid.pigments_deposited[i] = 0.5;
        }
        let params = RenderParams {
            granulation_gain: 0.0,
            wet_pigment_visibility: 0.0,
            ..RenderParams::default()
        };
        let image = render(&grid, &palette, &field, &params);
        let mix = mixed_totals(&palette, &[0.5, 0.0, 0.0, 0.0]);
        // Every output pixel reads the same uniform cell values, so the
        // reconstruction (a convex combination) reproduces the single-pixel
        // result of the uniform mix to f32 precision.
        let expect = composite_pixel(mix, mix, mix, CompositeMode::Subtractive);
        for y in 0..16 {
            for x in 0..16 {
                let px = image.pixel(x, y);
                for c in 0..4 {
                    assert!(
                        (px[c] - expect[c]).abs() < 1e-4,
                        "({x},{y}) channel {c}: {} vs {}",
                        px[c],
                        expect[c]
                    );
                }
            }
        }
    }

    #[test]
    fn two_glazes_are_darker_than_one() {
        let palette = Palette::water();
        let one = composite(
            &[mixed_layer(&palette, &[0.5, 0.0, 0.0, 0.0])],
            Rgb::new(1.0, 1.0, 1.0),
        );
        let two = composite(
            &[mixed_layer(&palette, &[0.5, 0.5, 0.0, 0.0])],
            Rgb::new(1.0, 1.0, 1.0),
        );
        assert!(two.mean() < one.mean());
    }
}
