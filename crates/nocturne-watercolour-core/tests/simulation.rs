use nocturne_watercolour_core::domain::sim::{self, PigmentCoefficients, Scratch, SimParams};
use nocturne_watercolour_core::domain::{
    BrushStroke, Operation, Palette, Paper, PaperField, Point, RadiusProfile, Seed, SimulationGrid,
    WaterStroke,
};

const N: u32 = 96;

fn fresh(seed: Seed) -> (SimulationGrid, Vec<PigmentCoefficients>) {
    let palette = Palette::moonlight();
    let field = PaperField::generate(&Paper::cold_press(seed), N, N);
    (
        SimulationGrid::new(&field, palette.len()),
        PigmentCoefficients::from_palette(&palette),
    )
}

fn disc(radius: f32, concentration: f32, water: f32) -> Operation {
    Operation::Brush(BrushStroke {
        path: vec![Point::new(0.5, 0.5)],
        radius: RadiusProfile::uniform(radius),
        pigment: 0,
        concentration,
        water,
        softness: 0.2,
    })
}

fn run(grid: &mut SimulationGrid, coef: &[PigmentCoefficients], params: &SimParams, ticks: u32) {
    let mut scratch = Scratch::for_grid(grid);
    for _ in 0..ticks {
        sim::step(grid, coef, params, &mut scratch);
    }
}

#[test]
fn same_seed_is_bit_identical_and_different_seed_differs() {
    let params = SimParams::default();
    let mut runs = Vec::new();
    for seed in [Seed(11), Seed(11), Seed(12)] {
        let (mut grid, coef) = fresh(seed);
        sim::apply(&mut grid, &disc(0.2, 0.6, 1.0), &params, seed);
        run(&mut grid, &coef, &params, 120);
        runs.push(grid);
    }
    assert_eq!(runs[0], runs[1]);
    assert_ne!(runs[0].pigments_deposited, runs[2].pigments_deposited);
}

#[test]
fn stability_sweep_stays_finite_and_bounded() {
    let mut extremes = Vec::new();
    for (i, scale) in [0.0f32, 0.5, 1.0].into_iter().enumerate() {
        let p = SimParams {
            slope_gain: 3.0 * scale,
            pressure_gain: 1.5 * scale,
            viscosity: 0.25 * scale,
            drag: scale,
            pigment_diffusion: scale,
            water_diffusion: scale,
            flow_outward_eta: 0.2 * scale,
            deposition_rate: 0.5 * scale,
            lift_rate: 0.5 * scale,
            shallow_boost: 10.0 * scale,
            capillary_absorb: 0.5 * scale,
            capillary_rate: scale,
            capillary_seep: 2.0 * scale,
            capillary_sigma: 0.05 + 0.9 * (1.0 - scale),
            evaporation: if i == 0 { 0.0 } else { 0.05 * scale },
            ..Default::default()
        };
        extremes.push(p);
    }
    for params in extremes {
        let (mut grid, coef) = fresh(Seed(5));
        sim::apply(&mut grid, &disc(0.3, 4.0, 4.0), &params, Seed(5));
        sim::apply(
            &mut grid,
            &Operation::Water(WaterStroke {
                path: vec![Point::new(0.2, 0.2), Point::new(0.8, 0.9)],
                radius: RadiusProfile::uniform(0.15),
                water: 4.0,
                softness: 1.0,
            }),
            &params,
            Seed(6),
        );
        run(&mut grid, &coef, &params, 500);
        assert!(grid.is_finite(), "non-finite state for {params:?}");
        for &p in &grid.pressure {
            assert!((0.0..=sim::MAX_WATER_DEPTH).contains(&p));
        }
        for &g in &grid.pigments_in_water {
            assert!((0.0..=sim::MAX_SUSPENDED).contains(&g));
        }
        for &d in &grid.pigments_deposited {
            assert!((0.0..=1.0).contains(&d));
        }
        for (&u, &v) in grid.velocity_u.iter().zip(&grid.velocity_v) {
            assert!(u.abs() <= params.max_velocity && v.abs() <= params.max_velocity);
        }
    }
}

fn radial_profile(grid: &SimulationGrid, pigment: usize) -> Vec<(f32, f32)> {
    let n = grid.cell_count();
    let c = (N as f32 - 1.0) / 2.0;
    (0..n)
        .map(|i| {
            let x = (i % N as usize) as f32 - c;
            let y = (i / N as usize) as f32 - c;
            let r = (x * x + y * y).sqrt() / N as f32;
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
fn wet_on_dry_darkens_the_edge() {
    let params = SimParams::default();
    let (mut grid, coef) = fresh(Seed(21));
    sim::apply(&mut grid, &disc(0.25, 0.4, 1.0), &params, Seed(21));
    run(&mut grid, &coef, &params, 600);
    sim::dry_all(&mut grid);
    let profile = radial_profile(&grid, 0);
    let centre = mean_in(&profile, 0.0, 0.1);
    let edge = mean_in(&profile, 0.16, 0.24);
    eprintln!("edge {edge} centre {centre}");
    assert!(
        edge > centre * 1.15,
        "edge {edge} should exceed centre {centre} by 15%"
    );
}

fn pigment_radius_90(grid: &SimulationGrid) -> f32 {
    let n = grid.cell_count();
    let c = (N as f32 - 1.0) / 2.0;
    let mut by_r: Vec<(f32, f32)> = (0..n)
        .map(|i| {
            let x = (i % N as usize) as f32 - c;
            let y = (i / N as usize) as f32 - c;
            let total = grid.pigments_deposited[i] + grid.pigments_in_water[i];
            ((x * x + y * y).sqrt() / N as f32, total)
        })
        .collect();
    by_r.sort_by(|a, b| a.0.total_cmp(&b.0));
    let total: f32 = by_r.iter().map(|(_, t)| t).sum();
    let mut acc = 0.0;
    for (r, t) in by_r {
        acc += t;
        if acc >= total * 0.9 {
            return r;
        }
    }
    1.0
}

#[test]
fn wet_on_wet_spreads_further_than_wet_on_dry() {
    let params = SimParams::default();
    let (mut dry, coef) = fresh(Seed(31));
    sim::apply(&mut dry, &disc(0.08, 0.6, 0.6), &params, Seed(31));
    run(&mut dry, &coef, &params, 80);

    let (mut wet, coef) = fresh(Seed(31));
    sim::apply(
        &mut wet,
        &Operation::Water(WaterStroke {
            path: vec![Point::new(0.5, 0.5)],
            radius: RadiusProfile::uniform(0.3),
            water: 1.0,
            softness: 0.3,
        }),
        &params,
        Seed(31),
    );
    sim::apply(&mut wet, &disc(0.08, 0.6, 0.6), &params, Seed(31));
    run(&mut wet, &coef, &params, 80);

    let r_dry = pigment_radius_90(&dry);
    let r_wet = pigment_radius_90(&wet);
    assert!(r_wet > r_dry * 1.3, "wet {r_wet} vs dry {r_dry}");
}
