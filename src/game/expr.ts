// 安全四则运算求值器 —— 替代 Function()/eval。
//
// 背景：生产构建的 CSP（tauri.conf.json: script-src 'self' 'wasm-unsafe-eval'）
// 不放行 JS 的 Function()/eval，此前用 Function() 求值结局权重/评分表达式，
// 在发行版一律抛异常又被 try/catch 吞掉 → 结局裁定、评分卡、命运岔口整体静默失效
// （开发模式 devUrl 不套该 CSP，所以本机看不出来）。
// 手写递归下降解析器不依赖动态代码执行，任何 CSP 下都能跑。
//
// 文法：expr = term (('+'|'-') term)* ; term = unary (('*'|'/') unary)*
//       unary = ('+'|'-')* primary ; primary = number | '(' expr ')'
// 仅接受数字与 + - * / ( )；非法输入抛异常，由调用方决定兜底值。
export function evalArith(input: string): number {
  const s = input;
  const n = s.length;
  let i = 0;

  function ws() {
    while (i < n && (s[i] === " " || s[i] === "\t" || s[i] === "\n" || s[i] === "\r")) i++;
  }
  function primary(): number {
    ws();
    if (s[i] === "(") {
      i++;
      const v = expr();
      ws();
      if (s[i] !== ")") throw new Error("缺少右括号");
      i++;
      return v;
    }
    const start = i;
    while (i < n && ((s[i] >= "0" && s[i] <= "9") || s[i] === ".")) i++;
    if (i === start) throw new Error(`位置 ${i} 处不是数字`);
    const v = Number(s.slice(start, i));
    if (!Number.isFinite(v)) throw new Error("非法数字");
    return v;
  }
  function unary(): number {
    ws();
    let sign = 1;
    while (s[i] === "+" || s[i] === "-") {
      if (s[i] === "-") sign = -sign;
      i++;
      ws();
    }
    return sign * primary();
  }
  function term(): number {
    let v = unary();
    for (;;) {
      ws();
      if (s[i] === "*") {
        i++;
        v *= unary();
      } else if (s[i] === "/") {
        i++;
        v /= unary();
      } else return v;
    }
  }
  function expr(): number {
    let v = term();
    for (;;) {
      ws();
      if (s[i] === "+") {
        i++;
        v += term();
      } else if (s[i] === "-") {
        i++;
        v -= term();
      } else return v;
    }
  }

  const v = expr();
  ws();
  if (i !== n) throw new Error(`位置 ${i} 处有多余字符`);
  return v;
}
