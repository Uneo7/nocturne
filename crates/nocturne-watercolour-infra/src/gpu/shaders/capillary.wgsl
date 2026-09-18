// Rule: Curtis SimulateCapillaryFlow (sim::pass_capillary). `capillary`
// gathers saturation exchange into scratch s2 with a symmetric pair
// function so the transfer is conservative without atomics; `capillary_wet`
// then wets cells whose new saturation crosses sigma (blooms), reading s2
// and writing only the cell's own wet/pressure. Deviation from Curtis: no
// destination threshold delta, as in the CPU reference. No deviation from
// the CPU reference.

fn capillary_transfer(s_from: f32, c_from: f32, s_to: f32, c_to: f32) -> f32 {
    if s_from > P.capillary_epsilon * c_from && s_from > s_to {
        return max(min(s_from - s_to, c_to - s_to), 0.0) * 0.25 * P.capillary_rate * P.dt;
    }
    return 0.0;
}

@compute @workgroup_size(256)
fn capillary(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    let nb = neighbours(i);
    let si = state[o_s() + i];
    let ci = state[o_c() + i];
    var ns = si;
    for (var t = 0u; t < 4u; t++) {
        let j = nb[t];
        if j == i { continue; }
        let sj = state[o_s() + j];
        let cj = state[o_c() + j];
        ns -= capillary_transfer(si, ci, sj, cj);
        ns += capillary_transfer(sj, cj, si, ci);
    }
    if wet(i) == 0.0 {
        ns *= 1.0 - P.capillary_dry * state[o_dry_rate()] * P.dt;
    }
    scratch[so_s() + i] = clamp(ns, 0.0, max(ci, 0.0));
}

@compute @workgroup_size(256)
fn capillary_wet(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    let m = state[o_m() + i];
    if wet(i) == 0.0 && scratch[so_s() + i] > P.capillary_sigma * state[o_c() + i] && m > 0.01 {
        state[o_wet() + i] = 1.0;
        state[o_p() + i] = min(state[o_p() + i] + P.capillary_seep * m, P.max_water_depth);
    }
}
