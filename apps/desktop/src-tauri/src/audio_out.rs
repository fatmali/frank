//! Plays Frank's natural voice through the default output device.
//!
//! One output stream lives on its own thread for the life of the app (on
//! macOS a stream can't move between threads). Audio is queued: each
//! sentence starts the moment the previous one ends.

use crate::state::lock;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex, OnceLock};

static PLAYER: OnceLock<Option<Player>> = OnceLock::new();

pub struct Player {
    queue: Arc<Mutex<VecDeque<f32>>>,
    rate: u32,
}

impl Player {
    /// The shared player, started on first use. None without an output device.
    pub fn get() -> Option<&'static Player> {
        PLAYER.get_or_init(start).as_ref()
    }

    /// The player if something has already started it.
    pub fn get_if_started() -> Option<&'static Player> {
        PLAYER.get().and_then(Option::as_ref)
    }

    /// Queues mono samples recorded at `rate`.
    pub fn play(&self, samples: &[f32], rate: u32) {
        let resampled = crate::voice::resample(samples, rate, self.rate);
        lock(&self.queue).extend(resampled);
    }

    /// Stops at once and drops whatever was queued.
    pub fn stop(&self) {
        lock(&self.queue).clear();
    }

    /// Seconds of audio still to play.
    pub fn pending_seconds(&self) -> f32 {
        lock(&self.queue).len() as f32 / self.rate as f32
    }
}

fn start() -> Option<Player> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let queue = Arc::new(Mutex::new(VecDeque::<f32>::new()));
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let shared = queue.clone();
    std::thread::spawn(move || {
        let host = cpal::default_host();
        let Some(device) = host.default_output_device() else {
            let _ = ready_tx.send(None);
            return;
        };
        let Ok(config) = device.default_output_config() else {
            let _ = ready_tx.send(None);
            return;
        };
        let channels = usize::from(config.channels()).max(1);
        let rate = config.sample_rate();

        macro_rules! stream {
            ($t:ty) => {{
                let queue = shared.clone();
                device.build_output_stream(
                    config.clone().into(),
                    move |out: &mut [$t], _: &cpal::OutputCallbackInfo| {
                        let mut q = lock(&queue);
                        for frame in out.chunks_mut(channels) {
                            let s = q.pop_front().unwrap_or(0.0);
                            for x in frame {
                                *x = <$t as cpal::FromSample<f32>>::from_sample_(s);
                            }
                        }
                    },
                    |e| eprintln!("frank: speaker: {e}"),
                    None,
                )
            }};
        }
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => stream!(f32),
            cpal::SampleFormat::I16 => stream!(i16),
            cpal::SampleFormat::I32 => stream!(i32),
            cpal::SampleFormat::U16 => stream!(u16),
            _ => {
                let _ = ready_tx.send(None);
                return;
            }
        };
        let Ok(stream) = stream else {
            let _ = ready_tx.send(None);
            return;
        };
        if stream.play().is_err() {
            let _ = ready_tx.send(None);
            return;
        }
        let _ = ready_tx.send(Some(rate));
        // Keep the stream alive for the life of the app.
        loop {
            std::thread::park();
        }
    });
    let rate = ready_rx.recv().ok().flatten()?;
    Some(Player { queue, rate })
}
