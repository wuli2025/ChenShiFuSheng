//! 把错误码表导出为 JSON，供前端 ui-kit 使用 —— 保证前后端文案不漂移。
//! cargo run -p gen-pipeline --example dump_errcodes -- <out.json>
fn main() -> anyhow::Result<()> {
    let out = std::env::args().nth(1).unwrap_or_else(|| "errcodes.json".into());
    let json = serde_json::to_string_pretty(gen_pipeline::errcode::ALL)?;
    std::fs::write(&out, &json)?;
    println!("✓ {} 条错误码 → {out}", gen_pipeline::errcode::ALL.len());
    Ok(())
}
