use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use nocturne_watercolour_core::application::EngineError;

use super::surface::PresentSurface;

/// One instance/adapter/device/queue set, shared by every engine and every
/// presentation surface created from it.
#[derive(Clone)]
pub struct GpuContext {
    inner: Arc<Inner>,
}

struct Inner {
    instance: wgpu::Instance,
    adapter: wgpu::Adapter,
    device: wgpu::Device,
    queue: wgpu::Queue,
    info: wgpu::AdapterInfo,
    /// Separate from `Inner` so the loss callback, which wgpu requires to be
    /// `Send`, captures only this and not the (non-`Send` on wasm) device.
    lost: Arc<AtomicBool>,
}

impl GpuContext {
    /// `Ok(None)` when the machine has no usable adapter, so callers (tests,
    /// examples) can skip rather than fail.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn try_new() -> Result<Option<GpuContext>, EngineError> {
        pollster::block_on(Self::new_async(
            wgpu::InstanceDescriptor::new_without_display_handle_from_env(),
        ))
    }

    /// The browser path: `request_adapter`/`request_device` resolve through
    /// JS promises, so the whole sequence is awaited. Works natively too.
    pub async fn new_async(
        descriptor: wgpu::InstanceDescriptor,
    ) -> Result<Option<GpuContext>, EngineError> {
        let instance = wgpu::Instance::new(descriptor);
        let adapter = match instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                ..Default::default()
            })
            .await
        {
            Ok(a) => a,
            Err(_) => return Ok(None),
        };
        let info = adapter.get_info();
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("nocturne-watercolour"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                ..Default::default()
            })
            .await
            .map_err(|e| EngineError::new(format!("request_device: {e}")))?;
        let lost = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&lost);
        device.set_device_lost_callback(move |_reason, _message| {
            flag.store(true, Ordering::Release);
        });
        // wgpu's handles are `!Send` on wasm; one `Arc` keeps a single code
        // path for both targets and costs an unused atomic there.
        #[allow(clippy::arc_with_non_send_sync)]
        let inner = Arc::new(Inner {
            instance,
            adapter,
            device,
            queue,
            info,
            lost,
        });
        Ok(Some(GpuContext { inner }))
    }

    /// Browser WebGPU only; never falls through to WebGL, whose limits the
    /// simulation's storage-buffer layout would not fit.
    #[cfg(target_arch = "wasm32")]
    pub async fn new_browser() -> Result<Option<GpuContext>, EngineError> {
        let mut descriptor = wgpu::InstanceDescriptor::new_without_display_handle();
        descriptor.backends = wgpu::Backends::BROWSER_WEBGPU;
        Self::new_async(descriptor).await
    }

    pub(super) fn device(&self) -> &wgpu::Device {
        &self.inner.device
    }

    pub(super) fn queue(&self) -> &wgpu::Queue {
        &self.inner.queue
    }

    pub(super) fn adapter(&self) -> &wgpu::Adapter {
        &self.inner.adapter
    }

    pub fn adapter_name(&self) -> &str {
        &self.inner.info.name
    }

    pub fn backend(&self) -> wgpu::Backend {
        self.inner.info.backend
    }

    /// Set once the driver or browser reports the device lost; every later
    /// submission is silently dropped, so hosts should stop and fall back.
    pub fn is_lost(&self) -> bool {
        self.inner.lost.load(Ordering::Acquire)
    }

    /// Replaces the loss flag's callback with one that also runs `callback`.
    /// `Send` is wgpu's requirement; on wasm the closure runs on the only
    /// thread there is.
    pub fn on_device_lost(&self, callback: impl Fn(String) + Send + 'static) {
        let flag = Arc::clone(&self.inner.lost);
        self.inner
            .device
            .set_device_lost_callback(move |reason, message| {
                flag.store(true, Ordering::Release);
                callback(format!("{reason:?}: {message}"));
            });
    }

    /// Blocks until all submitted work has completed. A no-op on WebGPU,
    /// where the browser polls the device.
    pub fn wait_idle(&self) -> Result<(), EngineError> {
        self.inner
            .device
            .poll(wgpu::PollType::wait_indefinitely())
            .map(|_| ())
            .map_err(|e| EngineError::new(format!("device poll: {e:?}")))
    }

    #[cfg(target_arch = "wasm32")]
    pub fn create_canvas_surface(
        &self,
        canvas: web_sys::HtmlCanvasElement,
        width: u32,
        height: u32,
    ) -> Result<PresentSurface, EngineError> {
        let surface = self
            .inner
            .instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
            .map_err(|e| EngineError::new(format!("create_surface: {e}")))?;
        PresentSurface::new(self, surface, width, height)
    }

    /// Native equivalent for hosts with a window handle; the same
    /// presentation path the browser adapter uses.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn create_window_surface(
        &self,
        target: impl Into<wgpu::SurfaceTarget<'static>>,
        width: u32,
        height: u32,
    ) -> Result<PresentSurface, EngineError> {
        let surface = self
            .inner
            .instance
            .create_surface(target)
            .map_err(|e| EngineError::new(format!("create_surface: {e}")))?;
        PresentSurface::new(self, surface, width, height)
    }
}
