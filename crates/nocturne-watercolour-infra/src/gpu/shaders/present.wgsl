// Presents the compute renderer's premultiplied linear RGBA frame (the
// `out` buffer of render.wgsl, one vec4 per output pixel) onto a swapchain
// texture of the same size. A fullscreen triangle covers the target; the
// fragment reads the buffer by pixel coordinate, so no sampler or texture
// copy is involved.
//
// `encode_srgb` is set when the swapchain format is not an `*-srgb` type
// (every browser canvas): premultiplied colour is un-premultiplied, run
// through the sRGB transfer curve and re-premultiplied so the compositor,
// which treats canvas bytes as encoded sRGB with premultiplied alpha, sees
// the same colour `PngExporter` writes. On an sRGB swapchain the hardware
// encodes and the value passes through linear.

struct PresentParams {
    width: u32,
    height: u32,
    encode_srgb: u32,
    _pad: u32,
};

@group(0) @binding(0) var<uniform> P: PresentParams;
@group(0) @binding(1) var<storage, read> frame: array<vec4<f32>>;

struct VertexOut {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vs_fullscreen(@builtin(vertex_index) index: u32) -> VertexOut {
    // Three vertices covering clip space: (-1,-1), (3,-1), (-1,3).
    let x = f32(i32(index & 1u) * 4 - 1);
    let y = f32(i32(index >> 1u) * 4 - 1);
    var out: VertexOut;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    return out;
}

fn linear_to_srgb(v: vec3<f32>) -> vec3<f32> {
    let c = clamp(v, vec3<f32>(0.0), vec3<f32>(1.0));
    let low = c * 12.92;
    let high = 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(high, low, c <= vec3<f32>(0.0031308));
}

@fragment
fn fs_present(in: VertexOut) -> @location(0) vec4<f32> {
    let x = min(u32(in.position.x), P.width - 1u);
    let y = min(u32(in.position.y), P.height - 1u);
    let px = frame[y * P.width + x];
    let alpha = clamp(px.a, 0.0, 1.0);
    if P.encode_srgb == 0u {
        return vec4<f32>(clamp(px.rgb, vec3<f32>(0.0), vec3<f32>(alpha)), alpha);
    }
    if alpha <= 1.0 / 1024.0 {
        return vec4<f32>(0.0);
    }
    let straight = clamp(px.rgb / alpha, vec3<f32>(0.0), vec3<f32>(1.0));
    return vec4<f32>(linear_to_srgb(straight) * alpha, alpha);
}
