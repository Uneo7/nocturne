// Rule: Curtis RelaxDivergence (sim::pass_divergence, pass_jacobi,
// pass_project). Divergence of the wet-cell velocity field, a fixed number
// of Jacobi iterations on the pressure correction (ping-pong between the two
// entry points `jacobi_a` q -> q2 and `jacobi_b` q2 -> q), then projection.
// Deviation from Curtis: fixed iteration count instead of a tolerance, same
// as the CPU reference. No deviation from the CPU reference.

@compute @workgroup_size(256)
fn divergence(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    let nb = neighbours(i);
    var d = 0.0;
    if wet(i) > 0.0 {
        d = 0.5 * (state[o_u() + nb.y] - state[o_u() + nb.x] + state[o_v() + nb.w] - state[o_v() + nb.z]);
    }
    scratch[so_div() + i] = d;
}

fn jacobi_step(i: u32, q_in: u32, q_out: u32) {
    if wet(i) == 0.0 {
        scratch[q_out + i] = 0.0;
        return;
    }
    let nb = neighbours(i);
    scratch[q_out + i] = 0.25 * (scratch[q_in + nb.x] + scratch[q_in + nb.y] + scratch[q_in + nb.z] + scratch[q_in + nb.w] - scratch[so_div() + i]);
}

@compute @workgroup_size(256)
fn jacobi_a(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    jacobi_step(i, so_q(), so_q2());
}

@compute @workgroup_size(256)
fn jacobi_b(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    jacobi_step(i, so_q2(), so_q());
}

// Reads the correction from `q` (the host copies q2 -> q when the iteration
// count is odd).
@compute @workgroup_size(256)
fn project(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= P.n { return; }
    let nb = neighbours(i);
    let u = state[o_u() + i] - 0.5 * (scratch[so_q() + nb.y] - scratch[so_q() + nb.x]);
    let v = state[o_v() + i] - 0.5 * (scratch[so_q() + nb.w] - scratch[so_q() + nb.z]);
    let b = bound_velocity(i, u, v);
    scratch[so_u() + i] = b.x;
    scratch[so_v() + i] = b.y;
}
