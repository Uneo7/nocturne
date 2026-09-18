//! Builds the canonical paint-on sequence: an initial wash, pigment dropped
//! in while it is still wet, optional later glazes laid wet-on-dry, then
//! settling and drying.

use crate::domain::{Mask, Operation, Timeline};

/// Fraction of `total_ticks` the implicit settle phase covers when no
/// explicit [`Reveal::settle`] is given, so the wash dries with a visible
/// tail instead of all at once at the end.
pub const DEFAULT_SETTLE_FRACTION: f32 = 0.3;

/// Evaporation rate of the implicit settle phase; matches the rate most
/// catalogue artworks author their explicit settle at.
const DEFAULT_SETTLE_RATE: f32 = 3.0;

/// Clamp for the settle evaporation rate, so an extreme tail length cannot
/// drive evaporation to a degenerate value.
const SETTLE_RATE_MIN: f32 = 0.5;
const SETTLE_RATE_MAX: f32 = 64.0;

/// Evaporation rate for a settle tail of `fraction` (fraction of total ticks)
/// from an authored `base_rate`. Scaled inversely with the fraction so the
/// total evaporation over the tail stays roughly constant: a longer tail dries
/// slower, so water keeps leaving and the last soft edges keep firming up to
/// the end instead of the scene holding a dry frame for the tail.
pub fn settle_rate_for(fraction: f32, base_rate: f32) -> f32 {
    let f = fraction.clamp(0.001, 1.0);
    (base_rate * (DEFAULT_SETTLE_FRACTION / f)).clamp(SETTLE_RATE_MIN, SETTLE_RATE_MAX)
}

#[derive(Debug, Clone)]
pub struct Reveal {
    total_ticks: u32,
    mask: Option<Mask>,
    wash: Vec<Operation>,
    drops: Vec<(f32, Operation)>,
    glazes: Vec<(f32, Operation)>,
    settle: Option<(f32, f32)>,
    settle_fraction: f32,
}

impl Reveal {
    pub fn new(total_ticks: u32) -> Reveal {
        Reveal {
            total_ticks: total_ticks.max(1),
            mask: None,
            wash: Vec::new(),
            drops: Vec::new(),
            glazes: Vec::new(),
            settle: None,
            settle_fraction: DEFAULT_SETTLE_FRACTION,
        }
    }

    /// Restricts where paint may go for the whole reveal.
    pub fn mask(mut self, mask: Mask) -> Self {
        self.mask = Some(mask);
        self
    }

    /// Phase 1: applied at tick 0.
    pub fn wash(mut self, op: Operation) -> Self {
        self.wash.push(op);
        self
    }

    /// Phase 2: applied at `at` (fraction of total ticks) while the wash is
    /// still wet, so it spreads and accumulates.
    pub fn drop_in(mut self, at: f32, op: Operation) -> Self {
        self.drops.push((at.clamp(0.0, 1.0), op));
        self
    }

    /// A later glaze laid wet-on-dry: everything painted so far is dried
    /// (`DryAll`) at the first glaze tick, then `op` is applied, so the new
    /// edge stays crisp and the overlap mixes optically rather than in water.
    pub fn glaze(mut self, at: f32, op: Operation) -> Self {
        self.glazes.push((at.clamp(0.0, 1.0), op));
        self
    }

    /// Phase 3: from `from` (fraction of total ticks) evaporation runs at
    /// `rate` times the base rate so the wash settles and dries. Beats the
    /// implicit [`Reveal::settle_fraction`] tail.
    pub fn settle(mut self, from: f32, rate: f32) -> Self {
        self.settle = Some((from.clamp(0.0, 1.0), rate));
        self
    }

    /// Fraction of the total ticks spent settling and drying when no
    /// [`Reveal::settle`] is given. The implicit settle starts at
    /// `1 - fraction`; the default leaves the last 30 % drying.
    pub fn settle_fraction(mut self, fraction: f32) -> Self {
        self.settle_fraction = fraction.clamp(0.0, 1.0);
        self
    }

    pub fn build(self) -> Timeline {
        let total = self.total_ticks;
        let at = |f: f32| ((f * total as f32).round() as u32).min(total.saturating_sub(1));
        let mut timeline = Timeline::new(total);
        if let Some(mask) = self.mask {
            timeline.push(0, Operation::SetMask(mask));
        }
        for op in self.wash {
            timeline.push(0, op);
        }
        for (f, op) in self.drops {
            timeline.push(at(f), op);
        }
        let mut dried_at: Option<u32> = None;
        for (f, op) in self.glazes {
            let tick = at(f);
            if dried_at.is_none_or(|t| t != tick) && dried_at.is_none() {
                timeline.push(tick, Operation::DryAll);
                dried_at = Some(tick);
            }
            timeline.push(tick, op);
        }
        match self.settle {
            Some((from, rate)) => {
                timeline.push(at(from), Operation::Dry { rate });
            }
            None => {
                let start = at(1.0 - self.settle_fraction);
                timeline.push(
                    start,
                    Operation::Dry {
                        rate: settle_rate_for(self.settle_fraction, DEFAULT_SETTLE_RATE),
                    },
                );
            }
        }
        timeline.push(total, Operation::DryAll);
        timeline
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phases_land_in_order() {
        let t = Reveal::new(200)
            .wash(Operation::ClearMask)
            .drop_in(0.25, Operation::ClearMask)
            .settle(0.6, 3.0)
            .build();
        let ticks: Vec<u32> = t.events.iter().map(|e| e.at_tick).collect();
        assert_eq!(ticks, vec![0, 50, 120, 200]);
        assert_eq!(t.events.last().unwrap().op, Operation::DryAll);
    }

    #[test]
    fn glazes_dry_everything_first_then_apply() {
        let t = Reveal::new(100)
            .wash(Operation::ClearMask)
            .glaze(0.5, Operation::Dry { rate: 2.0 })
            .glaze(0.5, Operation::ClearMask)
            .build();
        let at_50: Vec<&Operation> = t
            .events
            .iter()
            .filter(|e| e.at_tick == 50)
            .map(|e| &e.op)
            .collect();
        assert_eq!(at_50[0], &Operation::DryAll);
        assert_eq!(at_50.len(), 3);
    }

    fn dry_ticks(t: &Timeline) -> Vec<u32> {
        t.events
            .iter()
            .filter_map(|e| match e.op {
                Operation::Dry { .. } => Some(e.at_tick),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn implicit_settle_covers_the_last_third_of_the_ticks() {
        let t = Reveal::new(200).wash(Operation::ClearMask).build();
        assert_eq!(dry_ticks(&t), vec![140]);
        assert_eq!(t.events.last().unwrap().op, Operation::DryAll);
    }

    #[test]
    fn settle_fraction_moves_the_implicit_tail() {
        let t = Reveal::new(200)
            .wash(Operation::ClearMask)
            .settle_fraction(0.1)
            .build();
        assert_eq!(dry_ticks(&t), vec![180]);
    }

    #[test]
    fn explicit_settle_beats_the_implicit_tail() {
        let t = Reveal::new(200)
            .wash(Operation::ClearMask)
            .settle(0.85, 2.0)
            .build();
        assert_eq!(dry_ticks(&t), vec![170]);
    }

    #[test]
    fn settle_rate_is_unity_at_the_default_fraction_and_falls_inversely() {
        assert!((settle_rate_for(DEFAULT_SETTLE_FRACTION, 3.0) - 3.0).abs() < 1e-6);
        let slower = settle_rate_for(0.4, 3.0);
        let slowest = settle_rate_for(0.6, 3.0);
        assert!(slower < 3.0 && slower > 2.0, "slower {slower}");
        assert!(slowest < slower, "slowest {slowest}");
        assert!((settle_rate_for(0.4, 3.0) - 3.0 * DEFAULT_SETTLE_FRACTION / 0.4).abs() < 1e-6);
        assert_eq!(settle_rate_for(0.001, 3.0), SETTLE_RATE_MAX);
        assert_eq!(settle_rate_for(1.0, 0.1), SETTLE_RATE_MIN);
    }
}
