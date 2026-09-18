//! Drives a [`Simulator`] through a scene's timeline.
//!
//! # Tick semantics
//!
//! "At tick `t`" means `t` steps have run. Advancing one tick applies every
//! event scheduled at the current tick, then steps once. Events scheduled at
//! `total_ticks` run when the end is reached, followed by an implicit
//! `DryAll`, so a scene is guaranteed fully dry when finished.
//!
//! # Artistic duration
//!
//! `duration_ms` maps wall-clock progress `p in 0..1` to ticks with
//! `ease(p) = 1 - (1 - p)^2`: the first half of the duration runs three
//! quarters of the ticks, so the wash lands and spreads quickly and the
//! remaining time is spent watching it settle and dry. `set_progress_curve`
//! swaps this for a linear one-to-one mapping when a caller supplies its own
//! easing via `advance_to_progress`.
//!
//! # Seeking
//!
//! Seeking never edits a timestamp. It restores the nearest checkpoint at or
//! before the target and replays deterministically from there, so seeking
//! then stepping is bit-identical to a straight run.
//!
//! # Checkpoint policy and memory bound
//!
//! A checkpoint is taken at tick 0, at every tick that carries a timeline
//! event, and every `CheckpointPolicy::every_ticks` ticks, subject to the
//! backend's `checkpoint_capacity`. When the budget is full, the oldest
//! periodic (non-event) checkpoint after tick 0 is released to make room;
//! if only event checkpoints remain, no more are taken and seeks replay
//! further. Memory is therefore `capacity * checkpoint_bytes`, where the
//! backend derives capacity from its own budget.

use crate::domain::{Operation, Scene, SubSeed};

use super::ports::{CheckpointId, EngineError, Simulator};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaybackState {
    Paused,
    Playing,
    Finished,
}

/// How `advance_by_elapsed` and `seek_progress` map progress to ticks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProgressCurve {
    /// `ease(p) = 1 - (1 - p)^2`: the first half of the duration runs three
    /// quarters of the ticks, so the wash lands fast and the tail settles.
    FrontLoaded,
    /// `tick = round(p * total_ticks)`, one-for-one; for callers driving with
    /// `advance_to_progress` and their own easing, so `progress()` stays in
    /// the same space they drive in.
    Linear,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CheckpointPolicy {
    pub every_ticks: u32,
}

impl Default for CheckpointPolicy {
    fn default() -> Self {
        CheckpointPolicy { every_ticks: 32 }
    }
}

const EASE_EXPONENT: f32 = 2.0;

pub fn ease(progress: f32) -> f32 {
    let p = progress.clamp(0.0, 1.0);
    1.0 - (1.0 - p).powf(EASE_EXPONENT)
}

pub fn ease_inverse(eased: f32) -> f32 {
    let e = eased.clamp(0.0, 1.0);
    1.0 - (1.0 - e).powf(1.0 / EASE_EXPONENT)
}

#[derive(Debug, Clone, Copy)]
struct Checkpoint {
    tick: u32,
    id: CheckpointId,
    at_event: bool,
}

pub struct Playback<S: Simulator> {
    sim: S,
    scene: Scene,
    tick: u32,
    state: PlaybackState,
    duration_ms: f32,
    elapsed_progress: f32,
    curve: ProgressCurve,
    policy: CheckpointPolicy,
    checkpoints: Vec<Checkpoint>,
}

impl<S: Simulator> Playback<S> {
    pub fn new(mut sim: S, scene: Scene, duration_ms: f32) -> Result<Self, EngineError> {
        scene
            .validate()
            .map_err(|e| EngineError::new(format!("invalid scene: {e:?}")))?;
        if !duration_ms.is_finite() || duration_ms <= 0.0 {
            return Err(EngineError::new("duration_ms must be positive"));
        }
        sim.load(&scene)?;
        let mut pb = Playback {
            sim,
            scene,
            tick: 0,
            state: PlaybackState::Paused,
            duration_ms,
            elapsed_progress: 0.0,
            curve: ProgressCurve::FrontLoaded,
            policy: CheckpointPolicy::default(),
            checkpoints: Vec::new(),
        };
        pb.take_checkpoint(true)?;
        Ok(pb)
    }

    pub fn with_policy(mut self, policy: CheckpointPolicy) -> Self {
        self.policy = CheckpointPolicy {
            every_ticks: policy.every_ticks.max(1),
        };
        self
    }

    pub fn scene(&self) -> &Scene {
        &self.scene
    }

    pub fn simulator(&mut self) -> &mut S {
        &mut self.sim
    }

    pub fn into_simulator(self) -> S {
        self.sim
    }

    pub fn current_tick(&self) -> u32 {
        self.tick
    }

    pub fn total_ticks(&self) -> u32 {
        self.scene.timeline.total_ticks
    }

    pub fn state(&self) -> PlaybackState {
        self.state
    }

    pub fn duration_ms(&self) -> f32 {
        self.duration_ms
    }

    /// Artistic progress `0..1` corresponding to the current tick.
    pub fn progress(&self) -> f32 {
        let t = self.tick as f32 / self.total_ticks() as f32;
        match self.curve {
            ProgressCurve::FrontLoaded => ease_inverse(t),
            ProgressCurve::Linear => t,
        }
    }

    pub fn tick_for_progress(&self, progress: f32) -> u32 {
        let p = progress.clamp(0.0, 1.0);
        match self.curve {
            ProgressCurve::FrontLoaded => (ease(p) * self.total_ticks() as f32).round() as u32,
            ProgressCurve::Linear => (p * self.total_ticks() as f32).round() as u32,
        }
    }

    /// Switches the curve `advance_by_elapsed` and `seek_progress` map progress
    /// with; callers that drive `advance_to_progress` with their own easing set
    /// `Linear` so `progress()` reads the same space they drive in.
    pub fn set_progress_curve(&mut self, curve: ProgressCurve) {
        self.curve = curve;
        self.elapsed_progress = self.progress();
    }

    pub fn play(&mut self) {
        if self.state != PlaybackState::Finished {
            self.state = PlaybackState::Playing;
        }
    }

    pub fn pause(&mut self) {
        if self.state == PlaybackState::Playing {
            self.state = PlaybackState::Paused;
        }
    }

    pub fn reset(&mut self) -> Result<(), EngineError> {
        self.seek_tick(0)?;
        self.state = PlaybackState::Paused;
        self.elapsed_progress = 0.0;
        Ok(())
    }

    /// Advances `ticks` steps regardless of play state, finishing at the end.
    pub fn advance_ticks(&mut self, ticks: u32) -> Result<(), EngineError> {
        let target = self.tick.saturating_add(ticks).min(self.total_ticks());
        self.run_to(target)?;
        self.elapsed_progress = self.elapsed_progress.max(self.progress());
        Ok(())
    }

    /// Consumes wall-clock time while playing; fractional ticks accumulate in
    /// the stored progress until they amount to whole ticks.
    pub fn advance_by_elapsed(&mut self, elapsed_seconds: f32) -> Result<(), EngineError> {
        if self.state != PlaybackState::Playing || !elapsed_seconds.is_finite() {
            return Ok(());
        }
        self.elapsed_progress =
            (self.elapsed_progress + elapsed_seconds.max(0.0) * 1000.0 / self.duration_ms).min(1.0);
        let target = self.tick_for_progress(self.elapsed_progress);
        if target > self.tick {
            self.run_to(target)?;
        }
        Ok(())
    }

    /// Advances to the tick `round(progress * total_ticks)` with no internal
    /// easing: steps forward when the target is ahead, seeks (checkpoint
    /// restore + replay) only when it is behind. Callers apply their own
    /// easing before calling, so this can be driven from any curve.
    pub fn advance_to_progress(&mut self, progress: f32) -> Result<(), EngineError> {
        let p = progress.clamp(0.0, 1.0);
        let target = (p * self.total_ticks() as f32).round() as u32;
        if target > self.tick {
            self.run_to(target)?;
        } else if target < self.tick {
            self.seek_tick(target)?;
        }
        self.elapsed_progress = p;
        Ok(())
    }

    pub fn seek_progress(&mut self, progress: f32) -> Result<(), EngineError> {
        let target = self.tick_for_progress(progress);
        self.seek_tick(target)?;
        self.elapsed_progress = progress.clamp(0.0, 1.0);
        Ok(())
    }

    pub fn seek_tick(&mut self, target: u32) -> Result<(), EngineError> {
        let target = target.min(self.total_ticks());
        if target < self.tick || self.state == PlaybackState::Finished {
            let cp = self
                .checkpoints
                .iter()
                .filter(|c| c.tick <= target)
                .max_by_key(|c| c.tick)
                .copied();
            match cp {
                Some(cp) => {
                    self.sim.restore(cp.id)?;
                    self.tick = cp.tick;
                }
                None => {
                    self.sim.load(&self.scene)?;
                    self.checkpoints.clear();
                    self.tick = 0;
                    self.take_checkpoint(true)?;
                }
            }
            self.state = PlaybackState::Paused;
        }
        self.run_to(target)?;
        self.elapsed_progress = self.progress();
        Ok(())
    }

    /// Runs the remaining ticks, applies the end-of-timeline events and dries
    /// everything.
    pub fn finish_immediately(&mut self) -> Result<(), EngineError> {
        self.run_to(self.total_ticks())?;
        self.elapsed_progress = 1.0;
        Ok(())
    }

    fn run_to(&mut self, target: u32) -> Result<(), EngineError> {
        while self.tick < target {
            self.apply_events_at(self.tick)?;
            self.sim.tick()?;
            self.tick += 1;
            if self.tick < self.total_ticks() {
                let at_event = self.scene.timeline.events_at(self.tick).next().is_some();
                if at_event || self.tick.is_multiple_of(self.policy.every_ticks) {
                    self.take_checkpoint(at_event)?;
                }
            }
        }
        if self.tick == self.total_ticks() && self.state != PlaybackState::Finished {
            self.apply_events_at(self.tick)?;
            self.sim.apply(&Operation::DryAll, self.scene.seed)?;
            self.state = PlaybackState::Finished;
        }
        Ok(())
    }

    fn apply_events_at(&mut self, tick: u32) -> Result<(), EngineError> {
        let events: Vec<(usize, Operation)> = self
            .scene
            .timeline
            .events_at(tick)
            .map(|(i, e)| (i, e.op.clone()))
            .collect();
        for (index, op) in events {
            let seed = self.scene.seed.derive(SubSeed::Brush(index as u32));
            self.sim.apply(&op, seed)?;
        }
        Ok(())
    }

    fn take_checkpoint(&mut self, at_event: bool) -> Result<(), EngineError> {
        if self.checkpoints.iter().any(|c| c.tick == self.tick) {
            return Ok(());
        }
        let capacity = self.sim.checkpoint_capacity();
        if capacity == 0 {
            return Ok(());
        }
        if self.checkpoints.len() >= capacity {
            let victim = self
                .checkpoints
                .iter()
                .position(|c| !c.at_event && c.tick != 0);
            match victim {
                Some(pos) => {
                    let removed = self.checkpoints.remove(pos);
                    self.sim.release(removed.id);
                }
                None => return Ok(()),
            }
        }
        if let Some(id) = self.sim.snapshot()? {
            self.checkpoints.push(Checkpoint {
                tick: self.tick,
                id,
                at_event,
            });
        }
        Ok(())
    }

    pub fn checkpoint_ticks(&self) -> Vec<u32> {
        let mut t: Vec<u32> = self.checkpoints.iter().map(|c| c.tick).collect();
        t.sort_unstable();
        t
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn easing_is_monotone_front_loaded_and_invertible() {
        assert_eq!(ease(0.0), 0.0);
        assert_eq!(ease(1.0), 1.0);
        assert!(ease(0.5) > 0.5);
        for i in 0..=10 {
            let p = i as f32 / 10.0;
            assert!((ease_inverse(ease(p)) - p).abs() < 1e-5);
        }
    }
}
