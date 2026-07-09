//! chenshi-api —— 平台服务层。
//!
//! 一个二进制，两种投放：
//! - 云端：`chenshi-api`（默认），nginx 前置，PG/Redis 后置。
//! - 桌面：`chenshi-api --embedded`，Tauri sidecar 拉起，SQLite/JSON 本地存储。
//!
//! 网页端**没有**「目标文件夹」与「环境医生」两个功能：
//! - 产物固定写 `CHENSHI_DATA_DIR`（默认 D:\chenshi-data），前端零路径询问。
//! - CLI 可用性由 `/v1/health` 的 `cli-core selftest` 在部署期保证。

mod routes;
mod state;
mod store;

use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let embedded = std::env::args().any(|a| a == "--embedded");
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(if embedded { 17801 } else { 8080 });

    let data = gen_pipeline::data_dir();
    std::fs::create_dir_all(&data)?;
    tracing::info!(mode = if embedded { "embedded(桌面)" } else { "server(网页)" }, data = %data.display(), "启动");

    let app_state = state::AppState::new(&data, embedded)?;

    // 孤儿租约回收：worker 崩溃后任务退回队列，不作废。
    {
        let st = app_state.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(std::time::Duration::from_secs(30));
            loop {
                tick.tick().await;
                let n = st.store.reap_orphans(300);
                if n > 0 {
                    tracing::warn!(n, "回收孤儿任务（worker 崩溃），已退回队列");
                }
            }
        });
    }

    let static_dir = std::env::var("CHENSHI_WEB_DIR").unwrap_or_else(|_| "../frontend/dist".into());
    let games_dir = data.join("builds");
    std::fs::create_dir_all(&games_dir)?;

    let app = routes::router(app_state)
        // 产物仓静态直出：单文件 HTML / 封面。玩家读流量在此终结，不打 API。
        .nest_service("/games", ServeDir::new(&games_dir))
        .fallback_service(ServeDir::new(&static_dir).append_index_html_on_directories(true))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("listening on http://127.0.0.1:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}
