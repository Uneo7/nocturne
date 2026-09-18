// Rule: Curtis UpdateVelocities (sim::pass_velocity).
// Velocity from paper slope and water-depth gradient, explicit viscosity
// Laplacian, drag, clamp, and zeroing of components that point into dry
// cells. Deviation from Curtis: collocated velocities, as in the CPU
// reference. No deviation from the CPU reference.

@compute @workgroup_size(256)
fn velocity(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    let nb = neighbours(i);
    let l = nb.x; let r = nb.y; let up = nb.z; let dn = nb.w;
    let gx = (state[o_h() + r] - state[o_h() + l]) * 0.5 * P.slope_gain
        + (state[o_p() + r] - state[o_p() + l]) * 0.5 * P.pressure_gain;
    let gy = (state[o_h() + dn] - state[o_h() + up]) * 0.5 * P.slope_gain
        + (state[o_p() + dn] - state[o_p() + up]) * 0.5 * P.pressure_gain;
    let u = state[o_u() + i];
    let v = state[o_v() + i];
    let lap_u = state[o_u() + l] + state[o_u() + r] + state[o_u() + up] + state[o_u() + dn] - 4.0 * u;
    let lap_v = state[o_v() + l] + state[o_v() + r] + state[o_v() + up] + state[o_v() + dn] - 4.0 * v;
    let nu = (u - P.dt * gx + P.viscosity * lap_u) * (1.0 - P.drag);
    let nv = (v - P.dt * gy + P.viscosity * lap_v) * (1.0 - P.drag);
    let b = bound_velocity(i, nu, nv);
    scratch[so_u() + i] = b.x;
    scratch[so_v() + i] = b.y;
}
