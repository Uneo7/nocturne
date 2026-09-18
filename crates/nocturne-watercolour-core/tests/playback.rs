use nocturne_watercolour_core::application::{
    Advance, AdvanceByElapsed, CheckpointPolicy, CpuEngine, Playback, PlaybackState, ProgressCurve,
    Reveal, Simulator,
};
use nocturne_watercolour_core::domain::{
    Background, BrushStroke, Operation, Palette, Paper, Point, RadiusProfile, Scene, SceneId, Seed,
    SimResolution, SimulationGrid, SizeHint,
};

fn scene() -> Scene {
    let seed = Seed(77);
    let timeline = Reveal::new(160)
        .wash(Operation::Brush(BrushStroke {
            path: vec![Point::new(0.3, 0.5), Point::new(0.7, 0.5)],
            radius: RadiusProfile::uniform(0.18),
            pigment: 0,
            concentration: 0.5,
            water: 1.0,
            softness: 0.3,
        }))
        .drop_in(
            0.2,
            Operation::Brush(BrushStroke {
                path: vec![Point::new(0.5, 0.5)],
                radius: RadiusProfile::uniform(0.06),
                pigment: 2,
                concentration: 0.8,
                water: 0.4,
                softness: 0.5,
            }),
        )
        .settle(0.6, 4.0)
        .build();
    Scene {
        id: SceneId("playback-test".into()),
        size_hint: SizeHint {
            width: 128,
            height: 128,
        },
        paper: Paper::cold_press(seed),
        palette: Palette::moonlight(),
        timeline,
        seed,
        sim_resolution: SimResolution(64),
        background: Background::Transparent,
    }
}

#[test]
fn seek_then_step_equals_straight_replay() {
    let mut straight = Playback::new(CpuEngine::default(), scene(), 3000.0).unwrap();
    straight.advance_ticks(100).unwrap();
    let expected = straight.simulator().grid().unwrap().clone();

    let mut seeking = Playback::new(CpuEngine::default(), scene(), 3000.0)
        .unwrap()
        .with_policy(CheckpointPolicy { every_ticks: 16 });
    seeking.advance_ticks(140).unwrap();
    seeking.seek_tick(90).unwrap();
    assert_eq!(seeking.current_tick(), 90);
    Advance { ticks: 10 }.execute(&mut seeking).unwrap();
    assert_eq!(seeking.current_tick(), 100);
    assert_eq!(seeking.simulator().grid().unwrap(), &expected);
    assert!(seeking.checkpoint_ticks().contains(&32));
}

#[test]
fn seek_backwards_past_all_checkpoints_reloads_and_replays() {
    let mut pb = Playback::new(CpuEngine::default(), scene(), 3000.0)
        .unwrap()
        .with_policy(CheckpointPolicy { every_ticks: 1000 });
    pb.advance_ticks(60).unwrap();
    let expected = pb.simulator().grid().unwrap().clone();
    pb.advance_ticks(50).unwrap();
    pb.seek_tick(60).unwrap();
    assert_eq!(pb.simulator().grid().unwrap(), &expected);
}

#[test]
fn finish_immediately_ends_at_total_ticks_fully_dry() {
    let mut pb = Playback::new(CpuEngine::default(), scene(), 3000.0).unwrap();
    pb.advance_ticks(20).unwrap();
    pb.finish_immediately().unwrap();
    assert_eq!(pb.current_tick(), pb.total_ticks());
    assert_eq!(pb.state(), PlaybackState::Finished);
    assert_eq!(pb.progress(), 1.0);
    let grid = pb.simulator().grid().unwrap();
    assert!(grid.is_dry());
    assert!(grid.total_water() == 0.0);
    assert!(grid.pigments_in_water.iter().all(|&g| g == 0.0));
    assert!(grid.total_pigment() > 0.0);
}

#[test]
fn elapsed_time_is_front_loaded_and_accumulates_fractions() {
    let mut pb = Playback::new(CpuEngine::default(), scene(), 1000.0).unwrap();
    AdvanceByElapsed {
        elapsed_seconds: 0.5,
    }
    .execute(&mut pb)
    .unwrap();
    assert_eq!(pb.current_tick(), 0, "paused playback ignores elapsed time");
    pb.play();
    for _ in 0..5 {
        AdvanceByElapsed {
            elapsed_seconds: 0.1,
        }
        .execute(&mut pb)
        .unwrap();
    }
    assert_eq!(pb.current_tick(), pb.tick_for_progress(0.5));
    assert!(
        pb.current_tick() > 80,
        "half the time runs past half the ticks"
    );
    for _ in 0..5 {
        AdvanceByElapsed {
            elapsed_seconds: 0.1,
        }
        .execute(&mut pb)
        .unwrap();
    }
    assert_eq!(pb.state(), PlaybackState::Finished);
}

#[test]
fn seek_progress_then_reset_returns_to_start() {
    let mut pb = Playback::new(CpuEngine::default(), scene(), 1000.0).unwrap();
    pb.seek_progress(0.4).unwrap();
    assert!(pb.current_tick() > 0);
    pb.reset().unwrap();
    assert_eq!(pb.current_tick(), 0);
    assert!(pb.simulator().grid().unwrap().total_pigment() == 0.0);
}

#[test]
fn checkpoint_capacity_is_bounded() {
    let mut engine = CpuEngine::default();
    engine.load(&scene()).unwrap();
    let cap = engine.checkpoint_capacity();
    assert!((1..=64).contains(&cap));
    let mut ids = Vec::new();
    for _ in 0..cap {
        ids.push(engine.snapshot().unwrap().expect("within capacity"));
    }
    assert_eq!(engine.snapshot().unwrap(), None);
    engine.release(ids[0]);
    assert!(engine.snapshot().unwrap().is_some());
}

#[test]
fn advance_to_progress_forward_equals_straight_replay() {
    let mut stepping = Playback::new(CpuEngine::default(), scene(), 3000.0).unwrap();
    stepping.advance_to_progress(0.4).unwrap();
    stepping.advance_to_progress(0.7).unwrap();
    assert_eq!(stepping.current_tick(), (0.7_f32 * 160.0).round() as u32);
    let expected = stepping.simulator().grid().unwrap().clone();

    let mut straight = Playback::new(CpuEngine::default(), scene(), 3000.0).unwrap();
    straight
        .advance_ticks((0.7_f32 * 160.0).round() as u32)
        .unwrap();
    assert_eq!(straight.simulator().grid().unwrap(), &expected);
}

#[test]
fn advance_to_progress_backward_seeks_and_matches_fresh_replay() {
    let mut pb = Playback::new(CpuEngine::default(), scene(), 3000.0)
        .unwrap()
        .with_policy(CheckpointPolicy { every_ticks: 16 });
    pb.advance_to_progress(0.9).unwrap();
    pb.advance_to_progress(0.5).unwrap();
    assert_eq!(pb.current_tick(), 80);
    assert_eq!(
        pb.state(),
        PlaybackState::Paused,
        "a backward advance seeks"
    );
    let expected = pb.simulator().grid().unwrap().clone();

    let mut fresh = Playback::new(CpuEngine::default(), scene(), 3000.0).unwrap();
    fresh.advance_ticks(80).unwrap();
    assert_eq!(fresh.simulator().grid().unwrap(), &expected);
}

#[test]
fn advance_to_progress_to_one_finishes_and_dries() {
    let mut pb = Playback::new(CpuEngine::default(), scene(), 3000.0).unwrap();
    pb.advance_to_progress(0.4).unwrap();
    pb.advance_to_progress(1.0).unwrap();
    assert_eq!(pb.current_tick(), pb.total_ticks());
    assert_eq!(pb.state(), PlaybackState::Finished);
    let grid = pb.simulator().grid().unwrap();
    assert!(grid.is_dry());
    assert!(grid.total_water() == 0.0);
}

#[test]
fn linear_curve_maps_progress_one_to_one() {
    let mut pb = Playback::new(CpuEngine::default(), scene(), 1000.0).unwrap();
    pb.set_progress_curve(ProgressCurve::Linear);
    assert_eq!(pb.tick_for_progress(0.5), 80);
    assert_eq!(pb.tick_for_progress(1.0), 160);
    pb.play();
    AdvanceByElapsed {
        elapsed_seconds: 0.5,
    }
    .execute(&mut pb)
    .unwrap();
    assert_eq!(pb.current_tick(), 80);
    assert!((pb.progress() - 0.5).abs() < 0.01);
    pb.advance_to_progress(1.0).unwrap();
    assert_eq!(pb.state(), PlaybackState::Finished);
}

/// A disc wash with an accent dropped in while wet and only the implicit
/// settle tail, so the tail is where the water leaves and the rim darkens.
fn tail_scene(settle_fraction: f32) -> Scene {
    let seed = Seed(99);
    let timeline = Reveal::new(240)
        .wash(Operation::Brush(BrushStroke {
            path: vec![Point::new(0.5, 0.5)],
            radius: RadiusProfile::uniform(0.18),
            pigment: 0,
            concentration: 0.6,
            water: 2.0,
            softness: 0.2,
        }))
        .drop_in(
            0.2,
            Operation::Brush(BrushStroke {
                path: vec![Point::new(0.5, 0.5)],
                radius: RadiusProfile::uniform(0.06),
                pigment: 2,
                concentration: 0.8,
                water: 0.6,
                softness: 0.5,
            }),
        )
        .settle_fraction(settle_fraction)
        .build();
    Scene {
        id: SceneId("tail-test".into()),
        size_hint: SizeHint {
            width: 128,
            height: 128,
        },
        paper: Paper::cold_press(seed),
        palette: Palette::moonlight(),
        timeline,
        seed,
        sim_resolution: SimResolution(64),
        background: Background::Transparent,
    }
}

fn deposited_mean_abs_diff(a: &SimulationGrid, b: &SimulationGrid) -> f32 {
    a.pigments_deposited
        .iter()
        .zip(&b.pigments_deposited)
        .map(|(x, y)| (x - y).abs())
        .sum::<f32>()
        / a.pigments_deposited.len().max(1) as f32
}

fn radial_profile(grid: &SimulationGrid, pigment: usize) -> Vec<(f32, f32)> {
    let n = grid.cell_count();
    let w = grid.width as f32;
    let h = grid.height as f32;
    let c = ((w - 1.0) / 2.0, (h - 1.0) / 2.0);
    (0..n)
        .map(|i| {
            let x = (i % grid.width as usize) as f32 - c.0;
            let y = (i / grid.width as usize) as f32 - c.1;
            let r = (x * x + y * y).sqrt() / w;
            (r, grid.pigments_deposited[pigment * n + i])
        })
        .collect()
}

fn mean_in(profile: &[(f32, f32)], lo: f32, hi: f32) -> f32 {
    let vals: Vec<f32> = profile
        .iter()
        .filter(|(r, _)| *r >= lo && *r < hi)
        .map(|(_, d)| *d)
        .collect();
    vals.iter().sum::<f32>() / vals.len().max(1) as f32
}

#[test]
fn settle_tail_keeps_drying_to_the_end_and_darkens_the_rim() {
    let scene = tail_scene(0.4);
    let total = scene.timeline.total_ticks;
    let ticks: Vec<u32> = [0.70_f32, 0.85, 1.00]
        .iter()
        .map(|p| (p * total as f32).round() as u32)
        .collect();
    let grids: Vec<SimulationGrid> = ticks
        .iter()
        .map(|&t| {
            let mut pb = Playback::new(CpuEngine::default(), scene.clone(), 3000.0).unwrap();
            pb.advance_ticks(t).unwrap();
            pb.simulator().grid().unwrap().clone()
        })
        .collect();

    for pair in grids.windows(2) {
        let diff = deposited_mean_abs_diff(&pair[0], &pair[1]);
        eprintln!("deposited diff between consecutive tail frames: {diff}");
        assert!(
            diff > 1e-4,
            "the tail must keep changing instead of holding a dry frame: {diff}"
        );
    }

    let finished = &grids[2];
    assert!(finished.is_dry(), "the finished frame is fully dry");
    assert_eq!(finished.total_water(), 0.0);

    let edge_70 = mean_in(&radial_profile(&grids[0], 0), 0.16, 0.24);
    let edge_100 = mean_in(&radial_profile(finished, 0), 0.16, 0.24);
    eprintln!("boundary band deposited pigment: 70% {edge_70} 100% {edge_100}");
    assert!(
        edge_100 > edge_70,
        "the boundary band must darken over the tail: {edge_70} -> {edge_100}"
    );
}
