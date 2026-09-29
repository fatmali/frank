//! Plays Frank's voice through the default output device.
//!
//! One output stream lives on its own thread for the life of the app (on
//! macOS a stream can't move between threads). Audio is queued: each
//! sentence starts the moment the previous one ends. A sentence can carry a
//! mark, called when it starts playing, so the panel can follow along.

use crate::state::lock;
use std::collections::VecDeque;
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};

static PLAYER: OnceLock<Option<Player>> = OnceLock::new();

/// Called when a sentence starts playing.
pub type Mark = Box<dyn FnOnce() + Send>;

pub struct Player {
    tape: Arc<Mutex<Tape>>,
    rate: u32,
}

/// What's queued to play, and how far playback has got.
#[derive(Default)]
struct Tape {
    samples: VecDeque<f32>,
    /// Samples ever queued, and ever played.
    queued: u64,
    played: u64,
    /// Marks, by the sample they start at.
    marks: VecDeque<(u64, Mark)>,
}

impl Tape {
    fn push(&mut self, samples: Vec<f32>, mark: Option<Mark>) {
        if let Some(mark) = mark {
            self.marks.push_back((self.queued, mark));
        }
        self.queued += samples.len() as u64;
        self.samples.extend(samples);
    }

    /// The next sample to play, and the marks it reaches.
    fn next(&mut self, reached: &mut Vec<Mark>) -> f32 {
        let Some(s) = self.samples.pop_front() else {
            return 0.0;
        };
        while self.marks.front().is_some_and(|(at, _)| *at <= self.played) {
            reached.extend(self.marks.pop_front().map(|(_, m)| m));
        }
        self.played += 1;
        s
    }

    fn clear(&mut self) {
        self.samples.clear();
        self.marks.clear();
        self.played = self.queued;
    }
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

    /// Queues mono samples recorded at `rate`; `mark` is called when they
    /// start playing.
    pub fn play(&self, samples: &[f32], rate: u32, mark: Option<Mark>) {
        let resampled = crate::voice::resample(samples, rate, self.rate);
        lock(&self.tape).push(resampled, mark);
    }

    /// Stops at once and drops whatever was queued.
    pub fn stop(&self) {
        lock(&self.tape).clear();
    }

    /// Seconds of audio still to play.
    pub fn pending_seconds(&self) -> f32 {
        lock(&self.tape).samples.len() as f32 / self.rate as f32
    }
}

fn start() -> Option<Player> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let tape = Arc::new(Mutex::new(Tape::default()));
    let (ready_tx, ready_rx) = mpsc::channel();
    // Marks run here, off the audio thread.
    let (marks_tx, marks_rx) = mpsc::channel::<Vec<Mark>>();
    std::thread::spawn(move || {
        for marks in marks_rx {
            marks.into_iter().for_each(|m| m());
        }
    });
    let shared = tape.clone();
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
                let tape = shared.clone();
                let marks = marks_tx.clone();
                device.build_output_stream(
                    config.clone().into(),
                    move |out: &mut [$t], _: &cpal::OutputCallbackInfo| {
                        let mut reached = Vec::new();
                        let mut t = lock(&tape);
                        for frame in out.chunks_mut(channels) {
                            let s = t.next(&mut reached);
                            for x in frame {
                                *x = <$t as cpal::FromSample<f32>>::from_sample_(s);
                            }
                        }
                        drop(t);
                        if !reached.is_empty() {
                            let _ = marks.send(reached);
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
    Some(Player { tape, rate })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn counter() -> (Arc<AtomicUsize>, impl Fn(usize) -> Mark) {
        let fired = Arc::new(AtomicUsize::new(0));
        let f = fired.clone();
        (fired, move |n| {
            let f = f.clone();
            Box::new(move || {
                f.fetch_add(n, Ordering::SeqCst);
            })
        })
    }

    #[test]
    fn marks_fire_when_their_sentence_starts_playing() {
        let (fired, mark) = counter();
        let mut tape = Tape::default();
        tape.push(vec![0.1; 3], Some(mark(1)));
        tape.push(vec![0.2; 2], Some(mark(10)));
        let mut reached = Vec::new();
        assert_eq!(tape.next(&mut reached), 0.1);
        assert_eq!(reached.len(), 1, "the first sentence starts at once");
        tape.next(&mut reached);
        tape.next(&mut reached);
        assert_eq!(reached.len(), 1, "not the second until it plays");
        assert_eq!(tape.next(&mut reached), 0.2);
        assert_eq!(reached.len(), 2);
        reached.into_iter().for_each(|m| m());
        assert_eq!(fired.load(Ordering::SeqCst), 11);
        // Past the end: silence.
        let mut none = Vec::new();
        tape.next(&mut none);
        assert_eq!(tape.next(&mut none), 0.0);
    }

    #[test]
    fn stopping_forgets_the_marks_of_what_never_played() {
        let (fired, mark) = counter();
        let mut tape = Tape::default();
        tape.push(vec![0.1; 3], None);
        tape.push(vec![0.2; 3], Some(mark(1)));
        tape.clear();
        tape.push(vec![0.3; 2], Some(mark(5)));
        let mut reached = Vec::new();
        assert_eq!(tape.next(&mut reached), 0.3);
        reached.into_iter().for_each(|m| m());
        assert_eq!(fired.load(Ordering::SeqCst), 5);
    }
}
