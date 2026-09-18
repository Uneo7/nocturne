//! Ports and use cases. Infrastructure implements the ports; hosts call the
//! use cases.

pub mod cpu;
pub mod playback;
pub mod ports;
pub mod reveal;
pub mod use_cases;

pub use cpu::CpuEngine;
pub use playback::{CheckpointPolicy, Playback, PlaybackState, ProgressCurve};
pub use ports::{CheckpointId, EngineError, Exporter, Renderer, Simulator};
pub use reveal::{Reveal, settle_rate_for};
pub use use_cases::{
    Advance, AdvanceByElapsed, ApplyOperation, CreateScene, ExportFinished, SceneUpdate,
    UpdateScene,
};
