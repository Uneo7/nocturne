// Operations (paint::apply_brush, apply_water, apply_lift, sim::dry_all).
// The stamp coverage is rasterised on the CPU by the shared `paint` module
// and uploaded, so geometry is identical on both backends; these entry
// points only add it into the grid, with stroke water modulated by paper
// height as in paint::stroke_water_factor. No deviation from the CPU
// reference.

@compute @workgroup_size(256)
fn apply_brush(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    let cov = stamp[i] * state[o_m() + i];
    if cov <= 0.0 { return; }
    let k = min(stroke.pigment, P.pigment_count - 1u);
    let water = stroke.water * cov * stroke_water_factor(state[o_h() + i]);
    state[o_p() + i] += water;
    state[o_g(k) + i] += stroke.concentration * cov;
    if water > P.wet_threshold || state[o_p() + i] > P.wet_threshold {
        state[o_wet() + i] = 1.0;
    }
}

@compute @workgroup_size(256)
fn apply_water(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    let cov = stamp[i] * state[o_m() + i];
    if cov <= 0.0 { return; }
    state[o_p() + i] += stroke.water * cov * stroke_water_factor(state[o_h() + i]);
    if state[o_p() + i] > P.wet_threshold {
        state[o_wet() + i] = 1.0;
    }
}

@compute @workgroup_size(256)
fn apply_lift(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    let f = clamp(1.0 - stroke.strength * stamp[i], 0.0, 1.0);
    if f >= 1.0 { return; }
    state[o_p() + i] *= f;
    for (var k = 0u; k < P.pigment_count; k++) {
        state[o_g(k) + i] *= f;
        state[o_d(k) + i] *= f;
    }
}

@compute @workgroup_size(256)
fn dry_all(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    for (var k = 0u; k < P.pigment_count; k++) {
        let d = state[o_d(k) + i] + state[o_g(k) + i];
        state[o_d(k) + i] = min(d, 1.0);
        state[o_g(k) + i] = 0.0;
    }
    state[o_p() + i] = 0.0;
    state[o_wet() + i] = 0.0;
    state[o_u() + i] = 0.0;
    state[o_v() + i] = 0.0;
    state[o_s() + i] = 0.0;
}
