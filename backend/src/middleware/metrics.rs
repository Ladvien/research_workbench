use axum::{extract::Request, middleware::Next, response::Response};
use std::time::Instant;
use tracing::{info, warn};

#[derive(Debug)]
pub struct Metrics {
    pub requests_total: std::sync::atomic::AtomicU64,
    pub request_duration_ms: std::sync::Arc<std::sync::RwLock<Vec<u64>>>,
    pub active_connections: std::sync::atomic::AtomicU64,
}

impl Default for Metrics {
    fn default() -> Self {
        Self {
            requests_total: std::sync::atomic::AtomicU64::new(0),
            request_duration_ms: std::sync::Arc::new(std::sync::RwLock::new(Vec::with_capacity(10000))),
            active_connections: std::sync::atomic::AtomicU64::new(0),
        }
    }
}

impl Metrics {
    pub fn get_p50_latency(&self) -> u64 {
        let durations = self.request_duration_ms.read().unwrap();
        if durations.is_empty() {
            return 0;
        }
        let mut sorted = durations.clone();
        sorted.sort_unstable();
        sorted[sorted.len() / 2]
    }

    pub fn get_p95_latency(&self) -> u64 {
        let durations = self.request_duration_ms.read().unwrap();
        if durations.is_empty() {
            return 0;
        }
        let mut sorted = durations.clone();
        sorted.sort_unstable();
        sorted[(sorted.len() as f64 * 0.95) as usize]
    }

    pub fn get_p99_latency(&self) -> u64 {
        let durations = self.request_duration_ms.read().unwrap();
        if durations.is_empty() {
            return 0;
        }
        let mut sorted = durations.clone();
        sorted.sort_unstable();
        sorted[(sorted.len() as f64 * 0.99) as usize]
    }

    pub fn record_duration(&self, duration_ms: u64) {
        let mut durations = self.request_duration_ms.write().unwrap();
        durations.push(duration_ms);
        
        // Keep only last 10,000 requests to prevent memory bloat
        if durations.len() > 10000 {
            durations.drain(0..1000);
        }
    }
}

static METRICS: std::sync::OnceLock<Metrics> = std::sync::OnceLock::new();

pub fn get_global_metrics() -> &'static Metrics {
    METRICS.get_or_init(|| Metrics::default())
}

pub async fn metrics_middleware(request: Request, next: Next) -> Response {
    let start = Instant::now();
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    
    let metrics = get_global_metrics();
    
    // Increment request counter
    metrics.requests_total.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    metrics.active_connections.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    
    let response = next.run(request).await;
    
    let duration = start.elapsed();
    let status = response.status();
    
    // Record metrics
    metrics.active_connections.fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
    metrics.record_duration(duration.as_millis() as u64);
    
    // Log slow requests
    let duration_ms = duration.as_millis() as u64;
    if duration_ms > 1000 {
        warn!(
            "Slow request: {} {} - {}ms - {}",
            method, path, duration_ms, status
        );
    } else if duration_ms > 100 {
        info!(
            "Request: {} {} - {}ms - {}",
            method, path, duration_ms, status
        );
    }
    
    // Add performance headers
    let mut response = response;
    response.headers_mut().insert(
        "X-Response-Time-Ms",
        duration_ms.to_string().parse().unwrap(),
    );
    
    response
}