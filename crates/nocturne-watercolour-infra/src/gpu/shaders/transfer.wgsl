// Rule: Curtis TransferPigment plus evaporation, capillary absorption and
// drying (sim::pass_transfer). Per cell, in place: each invocation touches
// only its own index. Deposition is gated by the settle rule: pigment rides
// the water while the film is deep and settles hard as each cell thins
// (settle_base + dry_deposition * (1 - wet)^settle_curve), a deviation from
// Curtis shared with the CPU reference. Deviation from Curtis: absorption is
// a transfer that takes the water it adds to the fibres out of the film, so
// the sheet cannot manufacture water. No deviation from the CPU reference.

@compute @workgroup_size(256)
fn transfer(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    if wet(i) == 0.0 { return; }
    let p = state[o_p() + i];
    let h = state[o_h() + i];
    let m = state[o_m() + i];
    let dry_rate = state[o_dry_rate()];
    let w = smoothstep(P.wet_lo, P.wet_hi, p);
    let settle_gate = P.settle_base + P.dry_deposition * pow(1.0 - w, P.settle_curve);
    for (var k = 0u; k < P.pigment_count; k++) {
        let coef = pigments[k];
        let gi = o_g(k) + i;
        let di = o_d(k) + i;
        let g = state[gi];
        let d = state[di];
        var down = g * (1.0 - h * coef.granulation) * coef.density * P.deposition_rate * settle_gate * P.dt;
        var up = d * (1.0 + (h - 1.0) * coef.granulation) * coef.density / coef.staining_power * P.lift_rate * P.dt;
        down = clamp(down, 0.0, max(1.0 - d, 0.0));
        up = clamp(up, 0.0, max(P.max_suspended - g, 0.0));
        state[di] = clamp(d + down - up, 0.0, 1.0);
        state[gi] = clamp(g + up - down, 0.0, P.max_suspended);
    }
    let boost = 1.0 + P.mask_evaporation * (1.0 - m);
    let evap = (P.evaporation * dry_rate + state[o_settle_share()] * p) * boost * P.dt;
    var np = max(p - evap, 0.0);
    let c = state[o_c() + i];
    let s = state[o_s() + i];
    let absorbed = min(min(P.capillary_absorb * state[o_dry_rate()] * P.dt, max(c - s, 0.0)), np);
    state[o_s() + i] = min(s + absorbed, c);
    np -= absorbed;
    if np < P.dry_threshold {
        for (var k = 0u; k < P.pigment_count; k++) {
            let gi = o_g(k) + i;
            let di = o_d(k) + i;
            state[di] = min(state[di] + state[gi], 1.0);
            state[gi] = 0.0;
        }
        np = 0.0;
        state[o_wet() + i] = 0.0;
        state[o_u() + i] = 0.0;
        state[o_v() + i] = 0.0;
    }
    state[o_p() + i] = np;
}
